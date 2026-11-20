/**
 * Background "engine": owns the dictionary, the lemmatizer and the in-memory
 * known/ignored/learning sets, and keeps them in sync with IndexedDB.
 */
import { browser } from 'wxt/browser';
import { classifyWord, statusOfLemma, type ClassifyContext, type Classified, type WordStatus } from '../core/classify';
import { createLemmatizer, type Lemmatize } from '../core/lemmatize';
import { newSrsState } from '../core/srs';
import { db, type CardEntry, type ListStatus, type WordEntry, type WordSource } from '../db/schema';
import type { ClassifyItem, ContentMessage, LookupResult, NewCardInput, StatusUpdate } from '../messaging/protocol';

interface FreqData {
  surfaces: string[];
  lemmas: string[];
}

async function loadJson<T>(path: '/data/dict.json' | '/data/freq.json'): Promise<T> {
  const res = await fetch(browser.runtime.getURL(path));
  return (await res.json()) as T;
}

export class Engine {
  private dict: Record<string, string> = {};
  private lowerHeadwords = new Set<string>();
  private freq: FreqData = { surfaces: [], lemmas: [] };
  private lemmatize!: Lemmatize;
  readonly known = new Set<string>();
  readonly ignored = new Set<string>();
  /** lemma → number of active (non-promoted) cards */
  private learningCount = new Map<string, number>();
  private readonly learning = new Set<string>();
  private readyPromise: Promise<void> | null = null;

  ready(): Promise<void> {
    return (this.readyPromise ??= this.init());
  }

  private async init(): Promise<void> {
    const [dict, freq, words, cards] = await Promise.all([
      loadJson<Record<string, string>>('/data/dict.json'),
      loadJson<FreqData>('/data/freq.json'),
      db().words.toArray(),
      db().cards.toArray(),
    ]);
    this.dict = dict;
    this.lowerHeadwords = new Set(Object.keys(dict).filter((w) => w === w.toLowerCase()));
    this.freq = freq;
    const rank = new Map(freq.surfaces.map((w, i) => [w, i + 1]));
    this.lemmatize = createLemmatizer({
      isHeadword: (w) => this.lowerHeadwords.has(w),
      rank: (w) => rank.get(w) ?? Infinity,
    });
    for (const w of words) (w.status === 'known' ? this.known : this.ignored).add(w.lemma);
    for (const c of cards) if (!c.promoted) this.addLearning(c.lemma, 1);
  }

  private get ctx(): ClassifyContext {
    return {
      lemmatize: this.lemmatize,
      isLowerHeadword: (w) => this.lowerHeadwords.has(w),
      known: this.known,
      ignored: this.ignored,
      learning: this.learning,
    };
  }

  private addLearning(lemma: string, delta: number): void {
    const n = (this.learningCount.get(lemma) ?? 0) + delta;
    if (n > 0) {
      this.learningCount.set(lemma, n);
      this.learning.add(lemma);
    } else {
      this.learningCount.delete(lemma);
      this.learning.delete(lemma);
    }
  }

  statusOf(lemma: string): WordStatus {
    return statusOfLemma(lemma, lemma, this.ctx);
  }

  async classify(items: ClassifyItem[]): Promise<Record<string, Classified>> {
    await this.ready();
    const out: Record<string, Classified> = {};
    const ctx = this.ctx;
    for (const it of items) out[it.key] = classifyWord(it.norm, it.capInitial, ctx);
    return out;
  }

  lemmaOf(word: string): string {
    return this.lemmatize(word.toLowerCase());
  }

  async lookup(surface: string, lemma: string): Promise<LookupResult> {
    await this.ready();
    const lower = surface.toLowerCase();
    for (const w of [lemma, lower, surface]) {
      if (Object.hasOwn(this.dict, w)) return { lemma, headword: w, meaning: this.dict[w]!, status: this.statusOf(lemma) };
    }
    return { lemma, headword: null, meaning: null, status: this.statusOf(lemma) };
  }

  /** Lemmas of the frequency list, most frequent first (for seeding). */
  async frequentLemmas(n: number): Promise<string[]> {
    await this.ready();
    return this.freq.lemmas.slice(0, n);
  }

  // ---- mutations -------------------------------------------------------------

  /** Set (or clear with null) the list status of many lemmas, then broadcast. */
  async setStatuses(lemmas: string[], status: ListStatus | null, source: WordSource = 'manual'): Promise<void> {
    await this.ready();
    const now = Date.now();
    if (status === null) {
      await db().words.bulkDelete(lemmas);
    } else {
      const entries: WordEntry[] = lemmas.map((lemma) => ({ lemma, status, source, updatedAt: now }));
      await db().words.bulkPut(entries);
    }
    this.applyListStatus(lemmas, status);
  }

  /** Update in-memory sets after the DB changed (also used by import). */
  applyListStatus(lemmas: string[], status: ListStatus | null): void {
    for (const l of lemmas) {
      this.known.delete(l);
      this.ignored.delete(l);
      if (status === 'known') this.known.add(l);
      else if (status === 'ignored') this.ignored.add(l);
    }
    this.broadcast(lemmas);
  }

  async saveCard(input: NewCardInput): Promise<{ id: string }> {
    await this.ready();
    const now = Date.now();
    const card: CardEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      srs: newSrsState(now),
      streak: 0,
      promoted: false,
    };
    await db().cards.add(card);
    this.addLearning(card.lemma, 1);
    this.broadcast([card.lemma]);
    return { id: card.id };
  }

  /** Call after cards were deleted / promoted / imported. */
  async reloadLearning(): Promise<void> {
    await this.ready();
    const before = new Set(this.learning);
    this.learningCount.clear();
    this.learning.clear();
    for (const c of await db().cards.toArray()) if (!c.promoted) this.addLearning(c.lemma, 1);
    const changed = new Set([...before, ...this.learning].filter((l) => before.has(l) !== this.learning.has(l)));
    this.broadcast([...changed]);
  }

  /** Reload everything from the DB (after import / reset). */
  async reloadAll(): Promise<void> {
    await this.ready();
    this.known.clear();
    this.ignored.clear();
    for (const w of await db().words.toArray()) (w.status === 'known' ? this.known : this.ignored).add(w.lemma);
    await this.reloadLearning();
    void this.sendToAllTabs({ type: 'rescan' });
  }

  private broadcast(lemmas: string[]): void {
    if (lemmas.length === 0) return;
    const updates: StatusUpdate[] = lemmas.map((lemma) => ({ lemma, status: this.statusOf(lemma) }));
    // Large changes (seeding, import): let tabs rescan instead of sending huge lists.
    const msg: ContentMessage = updates.length > 2000 ? { type: 'rescan' } : { type: 'statusUpdates', updates };
    void this.sendToAllTabs(msg);
  }

  private async sendToAllTabs(msg: ContentMessage): Promise<void> {
    const tabs = await browser.tabs.query({});
    for (const t of tabs) {
      if (t.id === undefined) continue;
      browser.tabs.sendMessage(t.id, msg).catch(() => {
        /* tab without content script */
      });
    }
  }
}

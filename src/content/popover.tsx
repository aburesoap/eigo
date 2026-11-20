/**
 * Word popover rendered inside a closed Shadow DOM so page CSS cannot leak in
 * (and ours cannot leak out).
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { WordStatus } from '../core/classify';
import type { LookupResult } from '../messaging/protocol';
import { OWN_UI_ATTR } from '../sources/page-dom';
import { Meaning } from '../ui/Meaning';

export interface PopoverData {
  lemma: string;
  surface: string;
  sentence: string;
  status: WordStatus;
  lookup: Promise<LookupResult>;
}

export interface PopoverActions {
  known(lemma: string): Promise<void>;
  ignore(lemma: string): Promise<void>;
  save(data: PopoverData, meaning: string): Promise<void>;
}

const CSS = `
:host { all: initial; }
.pop {
  position: fixed; z-index: 2147483647; width: 320px; max-width: calc(100vw - 16px);
  box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
  background: #fff; color: #1f2328; border: 1px solid #d0d7de;
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
  text-align: left; letter-spacing: normal; text-transform: none;
}
@media (prefers-color-scheme: dark) {
  .pop { background: #161b22; color: #e6edf3; border-color: #30363d; }
  .meaning, .sentence { color: #c9d1d9 !important; }
  button { background: #21262d !important; color: #e6edf3 !important; border-color: #30363d !important; }
  button.save { background: #1f6feb !important; border-color: #1f6feb !important; color: #fff !important; }
}
.head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.lemma { font-size: 18px; font-weight: 700; }
.surface { color: #656d76; font-size: 13px; }
.badge { margin-left: auto; font-size: 11px; padding: 1px 6px; border-radius: 9px; background: #ddf4ff; color: #0969da; }
.meaning { margin: 4px 0 8px; color: #333; max-height: 160px; overflow: auto; }
.meaning div { padding: 1px 0; }
.sentence { font-size: 12px; color: #656d76; border-left: 3px solid #d0d7de; padding-left: 8px; margin-bottom: 10px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.meaning b { font-weight: 600; }
.sentence b { color: inherit; }
.btns { display: flex; gap: 6px; }
button {
  flex: 1; font: inherit; font-size: 13px; padding: 6px 0; cursor: pointer; border-radius: 6px;
  border: 1px solid #d0d7de; background: #f6f8fa; color: #1f2328;
}
button:hover { filter: brightness(0.96); }
button.save { background: #0969da; border-color: #0969da; color: #fff; }
button:disabled { opacity: .6; cursor: default; }
.msg { font-size: 13px; color: #1a7f37; text-align: center; padding: 6px 0; }
.err { color: #cf222e; }
.muted { color: #656d76; }
kbd { font: 11px ui-monospace, monospace; opacity: .7; margin-left: 4px; }
`;

function Popover({ data, actions, onClose }: { data: PopoverData; actions: PopoverActions; onClose: () => void }) {
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    data.lookup.then((r) => alive && setLookup(r)).catch(() => alive && setLookup(null));
    return () => {
      alive = false;
    };
  }, [data]);

  const run = async (fn: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setMsg({ text: done });
      setTimeout(onClose, 700);
    } catch (e) {
      setMsg({ text: `エラー: ${(e as Error).message}`, error: true });
      setBusy(false);
    }
  };

  const meaning = lookup?.meaning ?? '';
  const doKnown = () => run(() => actions.known(data.lemma), '既知語に追加しました');
  const doSave = () => run(() => actions.save(data, meaning), 'カードを保存しました');
  const doIgnore = () => run(() => actions.ignore(data.lemma), '無視リストに追加しました');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const action = { Escape: onClose, k: doKnown, s: doSave, i: doIgnore }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      void action();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const status = lookup?.status ?? data.status;
  // Highlight the word in the sentence preview.
  const idx = data.sentence.indexOf(data.surface);

  return (
    <div class="pop" role="dialog" aria-label={`${data.lemma} の意味`}>
      <div class="head">
        <span class="lemma">{data.lemma}</span>
        {data.surface.toLowerCase() !== data.lemma && <span class="surface">{data.surface}</span>}
        {status === 'learning' && <span class="badge">学習中</span>}
      </div>
      <div class="meaning">
        {lookup === null ? (
          <span class="muted">…</span>
        ) : meaning ? (
          <Meaning text={meaning} />
        ) : (
          <span class="muted">辞書に見つかりませんでした</span>
        )}
      </div>
      <div class="sentence">
        {idx >= 0 ? (
          <>
            {data.sentence.slice(0, idx)}
            <b>{data.surface}</b>
            {data.sentence.slice(idx + data.surface.length)}
          </>
        ) : (
          data.sentence
        )}
      </div>
      {msg ? (
        <div class={`msg ${msg.error ? 'err' : ''}`}>{msg.text}</div>
      ) : (
        <div class="btns">
          <button disabled={busy} onClick={doKnown} title="既知語に追加して下線を消す">知ってる<kbd>K</kbd></button>
          <button disabled={busy} class="save" onClick={doSave} title="例文つきでカードを保存">保存<kbd>S</kbd></button>
          <button disabled={busy} onClick={doIgnore} title="無視リストに追加（既知語率の計算からも除外）">無視<kbd>I</kbd></button>
        </div>
      )}
    </div>
  );
}

export class PopoverHost {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private mount: HTMLElement | null = null;
  private cleanup: (() => void) | null = null;

  constructor(private readonly actions: PopoverActions) {}

  /** The host element, to recognise clicks inside the popover. */
  get element(): HTMLElement | null {
    return this.host;
  }

  open(data: PopoverData, anchor: DOMRect): void {
    this.close();
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.setAttribute(OWN_UI_ATTR, '');
      this.root = this.host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = CSS;
      this.root.appendChild(style);
      this.mount = document.createElement('div');
      this.root.appendChild(this.mount);
    }
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);

    render(<Popover data={data} actions={this.actions} onClose={() => this.close()} />, this.mount!);
    this.position(anchor);
    // Re-position when the meaning finishes loading and the size changes.
    const ro = new ResizeObserver(() => this.position(anchor));
    const popEl = this.mount!.firstElementChild;
    if (popEl) ro.observe(popEl);

    const onDown = (e: Event) => {
      if (!e.composedPath().includes(this.host!)) this.close();
    };
    const onScroll = () => this.close();
    // Defer so the opening click does not immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('resize', onScroll);
    }, 0);
    this.cleanup = () => {
      ro.disconnect();
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }

  private position(anchor: DOMRect): void {
    const pop = this.mount!.firstElementChild as HTMLElement | null;
    if (!pop) return;
    const margin = 8;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = Math.min(Math.max(margin, anchor.left), window.innerWidth - w - margin);
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - margin && anchor.top - h - 6 > margin) top = anchor.top - h - 6;
    left = Math.max(margin, left);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(margin, top)}px`;
  }

  close(): void {
    this.cleanup?.();
    this.cleanup = null;
    if (this.mount) render(null, this.mount);
  }

  destroy(): void {
    this.close();
    this.host?.remove();
    this.host = null;
  }
}

/**
 * Generates the bundled data files from the downloaded sources
 * (run `npm run fetch:data` first):
 *
 *   public/data/dict.json  { [headword]: meaning }            from EJDict-hand (CC0)
 *   public/data/freq.json  { surfaces: string[], lemmas: string[] }
 *       surfaces: most frequent lowercase word forms (rank oracle for lemmatization)
 *       lemmas:   lemma frequency list, filtered to EJDict headwords (used to seed known words)
 *     derived from IlyaSemenov/wikipedia-word-frequency (MIT), enwiki-2023-04-13
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLemmatizer } from '../src/core/lemmatize';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'data-src');
const OUT = join(ROOT, 'public', 'data');
const SURFACE_LIMIT = 60_000;
const LEMMA_SCAN_LIMIT = 150_000;
const LEMMA_LIMIT = 12_000;

mkdirSync(OUT, { recursive: true });

// ---- dictionary ----
const dict: Record<string, string> = {};
const dictDir = join(SRC, 'EJDict', 'src');
for (const file of readdirSync(dictDir).filter((f) => f.endsWith('.txt')).sort()) {
  for (const line of readFileSync(join(dictDir, file), 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const words = line.slice(0, tab).trim();
    const meaning = line.slice(tab + 1).trim();
    if (!meaning) continue;
    // A line may list variants: "colour,color"
    for (const w of words.split(',').map((s) => s.trim()).filter(Boolean)) {
      dict[w] = dict[w] ? `${dict[w]} / ${meaning}` : meaning;
    }
  }
}
const lowerHeadwords = new Set(Object.keys(dict).filter((w) => /^[a-z][a-z'-]*$/.test(w)));
writeFileSync(join(OUT, 'dict.json'), JSON.stringify(dict));
console.log(`dict.json: ${Object.keys(dict).length} entries (${lowerHeadwords.size} lowercase words)`);

// ---- frequency ----
const freqLines = readFileSync(join(SRC, 'wwf', 'results', 'enwiki-2023-04-13.txt'), 'utf8').split('\n');
const surfaceCounts: [string, number][] = [];
for (const line of freqLines) {
  const [w, n] = line.split(' ');
  if (!w || !n || !/^[a-z]+$/.test(w)) continue;
  surfaceCounts.push([w, Number(n)]);
  if (surfaceCounts.length >= LEMMA_SCAN_LIMIT) break;
}
const surfaces = surfaceCounts.slice(0, SURFACE_LIMIT).map(([w]) => w);
const rankMap = new Map(surfaces.map((w, i) => [w, i + 1]));

const lemmatize = createLemmatizer({
  isHeadword: (w) => lowerHeadwords.has(w),
  rank: (w) => rankMap.get(w) ?? Infinity,
});

const lemmaCounts = new Map<string, number>();
for (const [w, n] of surfaceCounts) {
  const lemma = lemmatize(w);
  if (!lowerHeadwords.has(lemma)) continue;
  if (lemma.length < 2 && lemma !== 'a' && lemma !== 'i') continue;
  lemmaCounts.set(lemma, (lemmaCounts.get(lemma) ?? 0) + n);
}
const lemmas = [...lemmaCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, LEMMA_LIMIT)
  .map(([w]) => w);

writeFileSync(join(OUT, 'freq.json'), JSON.stringify({ surfaces, lemmas }));
console.log(`freq.json: ${surfaces.length} surfaces, ${lemmas.length} lemmas`);
console.log('top lemmas:', lemmas.slice(0, 40).join(' '));
console.log('around 3000:', lemmas.slice(2990, 3010).join(' '));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLemmatizer } from '../src/core/lemmatize';

const dataDir = join(import.meta.dirname, '..', 'public', 'data');
export const dict: Record<string, string> = JSON.parse(readFileSync(join(dataDir, 'dict.json'), 'utf8'));
export const freq: { surfaces: string[]; lemmas: string[] } = JSON.parse(readFileSync(join(dataDir, 'freq.json'), 'utf8'));
const rank = new Map(freq.surfaces.map((w, i) => [w, i + 1]));
export const isLowerHeadword = (w: string) => Object.hasOwn(dict, w) && w === w.toLowerCase();
export const lemmatize = createLemmatizer({ isHeadword: isLowerHeadword, rank: (w) => rank.get(w) ?? Infinity });

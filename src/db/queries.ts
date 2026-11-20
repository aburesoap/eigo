/**
 * Read-side queries shared by the background and extension pages.
 */
import { buildQueue, State, studyDayStart, type Queue } from '../core/srs';
import type { Settings } from '../settings';
import { db, type CardEntry } from './schema';

/** Learning cards due within this window are shown early when nothing else is left. */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface TodayQueue extends Queue<CardEntry> {
  doneToday: number;
  /** Learning cards due later today (within the learn-ahead window). */
  upcomingLearning: CardEntry[];
}

export async function loadTodayQueue(settings: Settings, now = Date.now()): Promise<TodayQueue> {
  const dayStart = studyDayStart(now, settings.dayStartHour);
  const [cards, reviews] = await Promise.all([
    db().cards.filter((c) => !c.promoted).toArray(),
    db().reviews.where('reviewedAt').aboveOrEqual(dayStart).toArray(),
  ]);
  const doneNewToday = reviews.filter((r) => r.state === State.New).length;
  const doneReviewToday = reviews.filter((r) => r.state === State.Review).length;
  const q = buildQueue({
    cards,
    now,
    doneNewToday,
    doneReviewToday,
    newLimit: settings.dailyNewLimit,
    reviewLimit: settings.dailyReviewLimit,
  });
  const upcomingLearning = cards
    .filter((c) => (c.srs.state === State.Learning || c.srs.state === State.Relearning) && c.srs.due > now && c.srs.due <= now + LEARN_AHEAD_MS)
    .sort((a, b) => a.srs.due - b.srs.due);
  return { ...q, doneToday: reviews.length, upcomingLearning };
}

/** Next card to show: due learning → reviews → new → learn-ahead. */
export function nextCard(q: TodayQueue): CardEntry | null {
  return q.learning[0] ?? q.review[0] ?? q.fresh[0] ?? q.upcomingLearning[0] ?? null;
}

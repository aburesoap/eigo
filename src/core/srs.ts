/**
 * Spaced repetition on top of ts-fsrs, with plain serializable card state.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';

/** FSRS card state stored in IndexedDB / JSON backups (dates as epoch ms). */
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: number;
}

export type ReviewRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const RATING_LABELS: Record<ReviewRating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export function toSrsState(card: Card): SrsState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : undefined,
  };
}

export function fromSrsState(s: SrsState): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review !== undefined ? new Date(s.last_review) : undefined,
  };
}

export function newSrsState(now: number): SrsState {
  return toSrsState(createEmptyCard(new Date(now)));
}

export interface ReviewResult {
  srs: SrsState;
  /** Consecutive successful (Good/Easy) reviews after this one. */
  streak: number;
  log: { rating: ReviewRating; state: State; elapsedDays: number; scheduledDays: number };
}

export function createScheduler(retention = 0.9) {
  const f = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }));

  return {
    review(srs: SrsState, streak: number, rating: ReviewRating, now: number): ReviewResult {
      const item = f.next(fromSrsState(srs), new Date(now), rating as Grade);
      return {
        srs: toSrsState(item.card),
        streak: nextStreak(streak, rating),
        log: {
          rating,
          state: item.log.state,
          elapsedDays: item.log.elapsed_days,
          scheduledDays: item.log.scheduled_days,
        },
      };
    },
    /** Human-readable next intervals per rating, for the buttons. */
    preview(srs: SrsState, now: number): Record<ReviewRating, number> {
      const out = {} as Record<ReviewRating, number>;
      for (const r of [1, 2, 3, 4] as ReviewRating[]) {
        out[r] = f.next(fromSrsState(srs), new Date(now), r as Grade).card.due.getTime() - now;
      }
      return out;
    },
  };
}

/** Good / Easy extend the streak, Again resets it, Hard keeps it. */
export function nextStreak(streak: number, rating: ReviewRating): number {
  if (rating === Rating.Again) return 0;
  if (rating === Rating.Hard) return streak;
  return streak + 1;
}

/** Card is promoted to the known list once the streak reaches the threshold (0 = never). */
export function shouldPromote(streak: number, promoteAfter: number): boolean {
  return promoteAfter > 0 && streak >= promoteAfter;
}

/** Start of the "study day" containing `now` (days roll over at `dayStartHour` local time). */
export function studyDayStart(now: number, dayStartHour = 4): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export interface QueueCard {
  id: string;
  srs: SrsState;
  createdAt: number;
}

export interface QueueInput<C extends QueueCard> {
  cards: C[];
  now: number;
  /** Number of new cards / reviews already done today. */
  doneNewToday: number;
  doneReviewToday: number;
  newLimit: number;
  reviewLimit: number;
}

export interface Queue<C> {
  /** Due learning/relearning cards (short-term steps, not limited). */
  learning: C[];
  review: C[];
  fresh: C[];
}

/** Build today's queue: due learning cards, then due reviews, then new cards within limits. */
export function buildQueue<C extends QueueCard>(input: QueueInput<C>): Queue<C> {
  const { cards, now } = input;
  const learning: C[] = [];
  const review: C[] = [];
  const fresh: C[] = [];
  for (const c of cards) {
    if (c.srs.state === State.New) fresh.push(c);
    else if (c.srs.due <= now) {
      if (c.srs.state === State.Review) review.push(c);
      else learning.push(c);
    }
  }
  learning.sort((a, b) => a.srs.due - b.srs.due);
  review.sort((a, b) => a.srs.due - b.srs.due);
  fresh.sort((a, b) => a.createdAt - b.createdAt);
  return {
    learning,
    review: review.slice(0, Math.max(0, input.reviewLimit - input.doneReviewToday)),
    fresh: fresh.slice(0, Math.max(0, input.newLimit - input.doneNewToday)),
  };
}

export { Rating, State };

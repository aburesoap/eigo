import { describe, expect, it } from 'vitest';
import { buildQueue, createScheduler, newSrsState, nextStreak, shouldPromote, State, studyDayStart } from '../src/core/srs';

const DAY = 86_400_000;

describe('scheduler', () => {
  it('schedules Good further than Again and stays serializable', () => {
    const now = Date.UTC(2026, 0, 1);
    const s = createScheduler();
    const card = newSrsState(now);
    const again = s.review(card, 0, 1, now);
    const good = s.review(card, 0, 3, now);
    expect(good.srs.due).toBeGreaterThanOrEqual(again.srs.due);
    expect(JSON.parse(JSON.stringify(good.srs))).toEqual(good.srs);
    expect(good.srs.reps).toBe(1);
  });
  it('grows intervals with repeated Good', () => {
    const s = createScheduler();
    let t = Date.UTC(2026, 0, 1);
    let card = newSrsState(t);
    for (let i = 0; i < 4; i++) {
      card = s.review(card, 0, 3, t).srs;
      t = card.due;
    }
    expect(card.state).toBe(State.Review);
    expect(card.scheduled_days).toBeGreaterThan(1);
  });
});

describe('streak & promotion', () => {
  it('tracks consecutive successes', () => {
    expect(nextStreak(2, 3)).toBe(3);
    expect(nextStreak(2, 4)).toBe(3);
    expect(nextStreak(2, 2)).toBe(2);
    expect(nextStreak(2, 1)).toBe(0);
  });
  it('promotes at threshold, never when 0', () => {
    expect(shouldPromote(5, 5)).toBe(true);
    expect(shouldPromote(4, 5)).toBe(false);
    expect(shouldPromote(100, 0)).toBe(false);
  });
});

describe('studyDayStart', () => {
  it('rolls over at the configured hour', () => {
    const at = (h: number) => new Date(2026, 0, 10, h, 30).getTime();
    expect(studyDayStart(at(3), 4)).toBe(new Date(2026, 0, 9, 4).getTime());
    expect(studyDayStart(at(5), 4)).toBe(new Date(2026, 0, 10, 4).getTime());
  });
});

describe('buildQueue', () => {
  const now = Date.UTC(2026, 0, 10);
  const mk = (id: string, state: State, due: number, createdAt = 0) => ({ id, createdAt, srs: { ...newSrsState(0), state, due } });
  const cards = [
    mk('n1', State.New, 0, 2), mk('n2', State.New, 0, 1), mk('n3', State.New, 0, 3),
    mk('r1', State.Review, now - DAY), mk('r2', State.Review, now - 2 * DAY), mk('r3', State.Review, now + DAY),
    mk('l1', State.Learning, now - 1000),
  ];
  it('respects limits and ordering', () => {
    const q = buildQueue({ cards, now, doneNewToday: 1, doneReviewToday: 0, newLimit: 3, reviewLimit: 1 });
    expect(q.learning.map((c) => c.id)).toEqual(['l1']);
    expect(q.review.map((c) => c.id)).toEqual(['r2']);
    expect(q.fresh.map((c) => c.id)).toEqual(['n2', 'n1']);
  });
});

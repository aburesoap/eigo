/**
 * Card mutations (review, edit, delete). Run in the background so the
 * engine's in-memory "learning" set stays in sync.
 */
import { createScheduler, shouldPromote, type ReviewRating } from '../core/srs';
import { db, type CardEntry } from '../db/schema';
import { getSettings } from '../settings';
import type { CardPatch } from '../messaging/protocol';
import type { Engine } from './engine';

export interface ReviewOutcome {
  card: CardEntry;
  promoted: boolean;
}

export async function reviewCard(engine: Engine, cardId: string, rating: ReviewRating, now = Date.now()): Promise<ReviewOutcome> {
  const card = await db().cards.get(cardId);
  if (!card) throw new Error('card not found');
  const settings = await getSettings();
  const result = createScheduler(settings.desiredRetention).review(card.srs, card.streak, rating, now);
  const promoted = !card.promoted && shouldPromote(result.streak, settings.promoteAfter);
  const updated: CardEntry = { ...card, srs: result.srs, streak: result.streak, promoted: card.promoted || promoted, updatedAt: now };

  await db().transaction('rw', db().cards, db().reviews, async () => {
    await db().cards.put(updated);
    await db().reviews.add({
      cardId,
      rating,
      reviewedAt: now,
      state: result.log.state,
      elapsedDays: result.log.elapsedDays,
      scheduledDays: result.log.scheduledDays,
    });
  });

  if (promoted) {
    // Graduate: the word joins the known list; its cards leave the review queue.
    const siblings = await db().cards.where('lemma').equals(card.lemma).toArray();
    await db().cards.bulkPut(siblings.map((c) => ({ ...c, promoted: true, updatedAt: now })));
    if (!engine.known.has(card.lemma)) await engine.setStatuses([card.lemma], 'known', 'promoted');
    await engine.reloadLearning();
  }
  return { card: updated, promoted };
}


export async function updateCard(engine: Engine, id: string, patch: CardPatch): Promise<CardEntry> {
  const card = await db().cards.get(id);
  if (!card) throw new Error('card not found');
  const updated = { ...card, ...patch, updatedAt: Date.now() };
  if (patch.lemma !== undefined) updated.lemma = patch.lemma.trim().toLowerCase();
  await db().cards.put(updated);
  if (patch.lemma !== undefined || patch.promoted !== undefined) await engine.reloadLearning();
  return updated;
}

export async function deleteCards(engine: Engine, ids: string[]): Promise<void> {
  await db().transaction('rw', db().cards, db().reviews, async () => {
    await db().cards.bulkDelete(ids);
    await db().reviews.where('cardId').anyOf(ids).delete();
  });
  await engine.reloadLearning();
}

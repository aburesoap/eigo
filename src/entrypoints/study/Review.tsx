import { useCallback, useEffect, useState } from 'preact/hooks';
import { makeCloze } from '../../core/cloze';
import { createScheduler, RATING_LABELS, type ReviewRating } from '../../core/srs';
import { loadTodayQueue, nextCard, type TodayQueue } from '../../db/queries';
import type { CardEntry } from '../../db/schema';
import { sendToBackground } from '../../messaging/protocol';
import { getSettings, type Settings } from '../../settings';
import { Meaning } from '../../ui/Meaning';
import { formatInterval } from './format';

export function Review() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [queue, setQueue] = useState<TodayQueue | null>(null);
  const [card, setCard] = useState<CardEntry | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const s = await getSettings();
    const q = await loadTodayQueue(s);
    setSettings(s);
    setQueue(q);
    setCard(nextCard(q));
    setFlipped(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rate = useCallback(
    async (rating: ReviewRating) => {
      if (!card || !flipped || busy) return;
      setBusy(true);
      try {
        const res = await sendToBackground('reviewCard', { cardId: card.id, rating });
        if (res.promoted) {
          setToast(`「${card.lemma}」を既知語に昇格しました`);
          setTimeout(() => setToast(null), 2500);
        }
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [card, flipped, busy, reload],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, dialog')) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key) as ReviewRating);
      } else if (flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        void rate(3);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate]);

  if (!queue || !settings) return <p class="muted">読み込み中…</p>;

  const counts = (
    <div class="counts">
      <span class="c-new">新規<b>{queue.fresh.length}</b></span>
      <span class="c-learn">学習中<b>{queue.learning.length + queue.upcomingLearning.length}</b></span>
      <span class="c-review">復習<b>{queue.review.length}</b></span>
    </div>
  );

  if (!card) {
    return (
      <>
        {counts}
        <div class="done">
          <h2>今日の復習は終わりました 🎉</h2>
          <p class="muted">今日の回答数: {queue.doneToday}</p>
          <p class="muted">ページ上の下線の単語をクリックして「保存」すると、カードが増えます。</p>
        </div>
        {toast && <div class="toast">{toast}</div>}
      </>
    );
  }

  const cloze = makeCloze(card.sentence, card.surface, card.lemma);
  const previews = flipped ? createScheduler(settings.desiredRetention).preview(card.srs, Date.now()) : null;

  return (
    <>
      {counts}
      <div class="card">
        <div class="cloze">
          {cloze.before}
          {flipped ? <span class="answer">{cloze.answer}</span> : <span class="blank" style={{ minWidth: `${Math.max(3, cloze.answer.length) * 0.55}em` }}>
              {settings.clozeHint ? cloze.answer[0] : '\u00a0'}
            </span>}
          {cloze.after}
        </div>
        {!cloze.found && !flipped && <div class="muted">（例文中に単語が見つからないため、文末に表示しています）</div>}
        {flipped && (
          <>
            <div class="back-head">
              <span class="lemma">{card.lemma}</span>
              {card.surface.toLowerCase() !== card.lemma && <span class="muted">{card.surface}</span>}
            </div>
            <div class="meaning">{card.meaning ? <Meaning text={card.meaning} /> : <span class="muted">（意味なし）</span>}</div>
            <div class="source">
              出典: <a href={card.url} target="_blank" rel="noreferrer">{card.title || card.url}</a>
            </div>
          </>
        )}
      </div>
      {!flipped ? (
        <button class="show primary" onClick={() => setFlipped(true)}>
          答えを見る <kbd>Space</kbd>
        </button>
      ) : (
        <div class="actions">
          {([1, 2, 3, 4] as ReviewRating[]).map((r) => (
            <button key={r} disabled={busy} class={r === 1 ? 'again' : r === 3 ? 'good' : ''} onClick={() => rate(r)}>
              <span>{RATING_LABELS[r]} <kbd>{r}</kbd></span>
              <small>{previews ? formatInterval(previews[r]) : ''}</small>
            </button>
          ))}
        </div>
      )}
      {toast && <div class="toast">{toast}</div>}
    </>
  );
}

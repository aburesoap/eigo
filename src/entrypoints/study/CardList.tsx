import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { State } from '../../core/srs';
import { db, type CardEntry } from '../../db/schema';
import { sendToBackground } from '../../messaging/protocol';
import { formatDate } from './format';

const STATE_LABEL: Record<number, string> = {
  [State.New]: '新規',
  [State.Learning]: '学習中',
  [State.Review]: '復習',
  [State.Relearning]: '再学習',
};

type Sort = 'created' | 'due' | 'lemma';

export function CardList() {
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('created');
  const [editing, setEditing] = useState<CardEntry | null>(null);

  const reload = async () => setCards(await db().cards.toArray());
  useEffect(() => {
    void reload();
  }, []);

  const shown = useMemo(() => {
    if (!cards) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? cards.filter((c) => [c.lemma, c.surface, c.sentence, c.meaning, c.title].some((f) => f.toLowerCase().includes(q)))
      : [...cards];
    list.sort((a, b) =>
      sort === 'lemma' ? a.lemma.localeCompare(b.lemma) : sort === 'due' ? a.srs.due - b.srs.due : b.createdAt - a.createdAt,
    );
    return list;
  }, [cards, query, sort]);

  const remove = async (c: CardEntry) => {
    if (!confirm(`「${c.lemma}」のカードを削除しますか？（復習履歴も削除されます）`)) return;
    await sendToBackground('deleteCards', { ids: [c.id] });
    await reload();
  };

  if (!cards) return <p class="muted">読み込み中…</p>;

  return (
    <>
      <div class="toolbar">
        <input type="search" placeholder="単語・例文・意味で検索" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as Sort)}>
          <option value="created">保存日（新しい順）</option>
          <option value="due">次回の出題日</option>
          <option value="lemma">単語（A→Z）</option>
        </select>
      </div>
      <p class="muted">
        {shown.length} / {cards.length} 枚
      </p>
      {cards.length === 0 ? (
        <p class="muted">まだカードがありません。ページ上の下線の単語をクリックして「保存」してください。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>単語</th>
              <th>例文</th>
              <th>状態</th>
              <th>次回</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td class="word">{c.lemma}</td>
                <td class="sent">{c.sentence.length > 120 ? `${c.sentence.slice(0, 120)}…` : c.sentence}</td>
                <td>
                  {c.promoted ? <span class="tag promoted">既知に昇格</span> : <span class="tag">{STATE_LABEL[c.srs.state]}</span>}
                </td>
                <td>{c.promoted ? '—' : c.srs.state === State.New ? '未学習' : formatDate(c.srs.due)}</td>
                <td class="ops">
                  <button onClick={() => setEditing(c)}>編集</button> <button onClick={() => remove(c)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <EditDialog
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </>
  );
}

function EditDialog({ card, onClose, onSaved }: { card: CardEntry; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ lemma: card.lemma, surface: card.surface, sentence: card.sentence, meaning: card.meaning, promoted: card.promoted });
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const set = (k: keyof typeof form) => (e: Event) => {
    const t = e.target as HTMLInputElement;
    setForm({ ...form, [k]: t.type === 'checkbox' ? t.checked : t.value });
  };
  const submit = async (e: Event) => {
    e.preventDefault();
    await sendToBackground('updateCard', { id: card.id, patch: form });
    onSaved();
  };
  return (
    <dialog ref={ref} onClose={onClose}>
      <form onSubmit={submit}>
        <label>見出し語<input value={form.lemma} onInput={set('lemma')} required /></label>
        <label>元の語形（穴埋めにする語）<input value={form.surface} onInput={set('surface')} required /></label>
        <label>例文<textarea value={form.sentence} onInput={set('sentence')} required /></label>
        <label>意味<textarea value={form.meaning} onInput={set('meaning')} /></label>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="checkbox" checked={form.promoted} onChange={set('promoted')} />
          既知に昇格済み（復習の対象外）
        </label>
        <p class="muted" style={{ margin: 0, fontSize: '12px' }}>
          出典: <a href={card.url} target="_blank" rel="noreferrer">{card.title || card.url}</a>
        </p>
        <div class="row">
          <button type="button" onClick={() => ref.current?.close()}>キャンセル</button>
          <button class="primary" type="submit">保存</button>
        </div>
      </form>
    </dialog>
  );
}

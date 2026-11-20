import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { Level } from '../../core/stats';
import type { ListStatus } from '../../db/schema';
import { sendToBackground, type ContentMessage, type ContentStats, type DueCounts } from '../../messaging/protocol';
import { setSiteEnabled } from '../../settings';

const LEVEL_LABEL: Record<Level, string> = {
  easy: '快適',
  medium: '辞書少し',
  hard: '難しい',
  none: '—',
};

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'ready'; tabId: number; stats: ContentStats };

async function fetchStats(): Promise<State> {
  // `?tab=<id>` lets the popup be opened as a normal page for testing.
  const tabParam = Number(new URLSearchParams(location.search).get('tab'));
  const tab = tabParam ? await browser.tabs.get(tabParam) : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !tab.url || !/^https?:|^file:/.test(tab.url)) {
    return { kind: 'unavailable', reason: 'このページでは使えません。' };
  }
  try {
    const msg: ContentMessage = { type: 'getStats' };
    const stats = (await browser.tabs.sendMessage(tab.id, msg)) as ContentStats | undefined;
    if (!stats) throw new Error('no stats');
    return { kind: 'ready', tabId: tab.id, stats };
  } catch {
    return { kind: 'unavailable', reason: 'ページを再読み込みすると有効になります。' };
  }
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [due, setDue] = useState<DueCounts | null>(null);
  useEffect(() => {
    sendToBackground('dueCounts', {}).then(setDue, () => {});
  }, []);
  const dueTotal = due ? due.fresh + due.learning + due.review : 0;
  const openPage = (path: '/study.html' | '/options.html') => {
    void browser.tabs.create({ url: browser.runtime.getURL(path) });
    window.close();
  };

  const refresh = () => void fetchStats().then(setState);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500); // stats keep updating while the page is analyzed
    return () => clearInterval(t);
  }, []);

  const mark = async (lemma: string, status: ListStatus) => {
    await sendToBackground('setStatus', { lemma, status });
    setTimeout(refresh, 400);
  };

  return (
    <div class="wrap">
      <div class="head">
        <h1>eigo</h1>
        {state.kind === 'ready' && (
          <label class="toggle">
            <input
              type="checkbox"
              checked={state.stats.enabled}
              onChange={async (e) => {
                await setSiteEnabled(state.stats.hostname, (e.target as HTMLInputElement).checked);
                setTimeout(refresh, 300);
              }}
            />
            このサイトで有効
          </label>
        )}
      </div>

      {state.kind === 'loading' && <p class="muted">読み込み中…</p>}
      {state.kind === 'unavailable' && <p class="muted">{state.reason}</p>}
      {state.kind === 'ready' && <StatsView stats={state.stats} onMark={mark} />}

      <div class="links">
        <button class="primary" onClick={() => openPage('/study.html')}>
          復習する{due ? `（${dueTotal}）` : ''}
        </button>
        <button onClick={() => openPage('/options.html')}>設定</button>
      </div>
    </div>
  );
}

function StatsView({ stats, onMark }: { stats: ContentStats; onMark: (lemma: string, s: ListStatus) => void }) {
  if (!stats.enabled) return <p class="muted">{stats.hostname} では無効になっています。</p>;
  const color = `var(--${stats.level})`;
  return (
    <>
      <div>
        <div class="meter">
          <span class="num" style={{ color }}>{stats.coverage === null ? '—' : stats.coverage.toFixed(1)}</span>
          <span class="muted">%</span>
          <span class="label" style={{ color }}>{LEVEL_LABEL[stats.level]}</span>
        </div>
        <div class="bar">
          <div style={{ width: `${stats.coverage ?? 0}%`, background: color }} />
        </div>
      </div>
      <div class="counts">
        <div><b>{stats.total}</b><span>総語数</span></div>
        <div><b>{stats.distinct}</b><span>異なり語数</span></div>
        <div><b>{stats.unknown}</b><span>未知語</span></div>
      </div>
      {stats.topUnknown.length > 0 && (
        <div>
          <h2>未知語（出現回数順）</h2>
          <div class="list">
            {stats.topUnknown.map((u) => (
              <div class="row" key={u.lemma}>
                <span class={`w ${u.status}`} title={u.status === 'learning' ? '学習中' : ''}>{u.lemma}</span>
                <span class="c">{u.count}</span>
                <button onClick={() => onMark(u.lemma, 'known')} title="既知語に追加">知ってる</button>
                <button onClick={() => onMark(u.lemma, 'ignored')} title="無視リストに追加">無視</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

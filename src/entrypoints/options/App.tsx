import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { BackupError, parseWordList, validateBackup, type Backup } from '../../core/backup';
import type { ListStatus } from '../../db/schema';
import { sendToBackground } from '../../messaging/protocol';
import { getSettings, SEED_SIZES, updateSettings, watchSettings, type Settings } from '../../settings';

type Summary = { known: number; ignored: number; cards: number; reviews: number };

function useSettings(): Settings | null {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    void getSettings().then(setS);
    return watchSettings(setS);
  }, []);
  return s;
}

export function App() {
  const settings = useSettings();
  const [summary, setSummary] = useState<Summary | null>(null);
  const refreshSummary = () => void sendToBackground('summary', {}).then(setSummary);
  useEffect(refreshSummary, []);

  if (!settings) return <div class="page">読み込み中…</div>;
  return (
    <div class="page">
      <header>
        <h1>eigo 設定</h1>
        <a href="/study.html">学習ページへ →</a>
      </header>
      {!settings.onboarded ? (
        <Setup onDone={refreshSummary} />
      ) : (
        <>
          <Summary summary={summary} />
          <StudySettings settings={settings} />
          <DisabledSites settings={settings} />
          <AddFrequent settings={settings} onDone={refreshSummary} />
          <DataManagement onChange={refreshSummary} />
          <About />
        </>
      )}
    </div>
  );
}

function Setup({ onDone }: { onDone: () => void }) {
  const [size, setSize] = useState<number>(5000);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    await sendToBackground('seed', { size });
    onDone();
  };
  return (
    <section class="setup" id="setup">
      <h2>はじめに：既知語の初期登録</h2>
      <p>
        英語の頻出語リストの上位 N 語を「知っている単語」として登録します。ここに含まれない単語に下線が引かれます。
        あとから「知ってる」ボタンや一括インポートで調整できます。
      </p>
      <div class="choices">
        {SEED_SIZES.map((n) => (
          <label key={n} class={`choice ${size === n ? 'selected' : ''}`}>
            <input type="radio" name="seed" checked={size === n} onChange={() => setSize(n)} />
            <b>{n === 0 ? 'なし' : `${n.toLocaleString()} 語`}</b>
            <span class="muted">{SEED_HINT[n]}</span>
          </label>
        ))}
      </div>
      <p class="muted small">
        頻出語リストは英語版 Wikipedia の単語頻度から作成しています（百科事典の語彙にやや偏っています）。
      </p>
      <button class="primary big" disabled={busy} onClick={start}>
        {busy ? '登録中…' : 'この設定で始める'}
      </button>
      <p class="muted small">バックアップから復元する場合は、下の「インポート」を使ってください。</p>
      <DataManagement onChange={onDone} compact />
    </section>
  );
}

const SEED_HINT: Record<number, string> = {
  0: '自分のリストを読み込む',
  1000: '初級（中学英語程度）',
  3000: '中級（高校英語程度）',
  5000: '中上級（おすすめ）',
  8000: '上級',
  10000: '上級＋',
};

function Summary({ summary }: { summary: Summary | null }) {
  return (
    <section>
      <div class="stats">
        <div><b>{summary?.known.toLocaleString() ?? '…'}</b><span>既知語</span></div>
        <div><b>{summary?.ignored.toLocaleString() ?? '…'}</b><span>無視リスト</span></div>
        <div><b>{summary?.cards.toLocaleString() ?? '…'}</b><span>カード</span></div>
        <div><b>{summary?.reviews.toLocaleString() ?? '…'}</b><span>復習回数</span></div>
      </div>
    </section>
  );
}

function NumberField(props: { label: string; hint?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label class="field">
      <span>
        {props.label}
        {props.hint && <small class="muted">{props.hint}</small>}
      </span>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)));
        }}
      />
    </label>
  );
}

function StudySettings({ settings: s }: { settings: Settings }) {
  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  return (
    <section>
      <h2>学習</h2>
      <div class="grid">
        <NumberField label="1日の新規カードの上限" value={s.dailyNewLimit} min={0} max={500} onChange={(v) => set({ dailyNewLimit: v })} />
        <NumberField label="1日の復習カードの上限" value={s.dailyReviewLimit} min={0} max={5000} onChange={(v) => set({ dailyReviewLimit: v })} />
        <NumberField
          label="既知語に昇格するまでの連続正解数"
          hint="Good / Easy の連続回数。Again で 0 に戻ります。0 で昇格しない"
          value={s.promoteAfter}
          min={0}
          max={50}
          onChange={(v) => set({ promoteAfter: v })}
        />
        <NumberField
          label="目標の記憶保持率（FSRS）"
          hint="高いほど復習が増えます（0.70〜0.97）"
          value={s.desiredRetention}
          min={0.7}
          max={0.97}
          step={0.01}
          onChange={(v) => set({ desiredRetention: v })}
        />
        <NumberField label="日付が変わる時刻" hint="0〜23時" value={s.dayStartHour} min={0} max={23} onChange={(v) => set({ dayStartHour: v })} />
      </div>
      <label class="check">
        <input type="checkbox" checked={s.clozeHint} onChange={(e) => set({ clozeHint: (e.target as HTMLInputElement).checked })} />
        穴埋めに最初の1文字をヒントとして表示する
      </label>
      <label class="check">
        <input type="checkbox" checked={s.showLearning} onChange={(e) => set({ showLearning: (e.target as HTMLInputElement).checked })} />
        カードを保存した単語は青い点線で表示する（オフにすると赤い下線のまま）
      </label>
    </section>
  );
}

function DisabledSites({ settings: s }: { settings: Settings }) {
  return (
    <section>
      <h2>無効にしたサイト</h2>
      {s.disabledSites.length === 0 ? (
        <p class="muted">なし（ポップアップの「このサイトで有効」から切り替えられます）</p>
      ) : (
        <ul class="sites">
          {s.disabledSites.map((h) => (
            <li key={h}>
              {h}{' '}
              <button onClick={() => void updateSettings({ disabledSites: s.disabledSites.filter((x) => x !== h) })}>有効に戻す</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddFrequent({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const [size, setSize] = useState(settings.seedSize || 5000);
  const [msg, setMsg] = useState('');
  return (
    <section>
      <h2>頻出語を既知語に追加</h2>
      <p class="muted">頻出語リストの上位 N 語のうち、まだ登録されていない語を追加します（削除はしません）。</p>
      <div class="inline">
        <select value={size} onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value))}>
          {SEED_SIZES.filter((n) => n > 0).map((n) => (
            <option key={n} value={n}>上位 {n.toLocaleString()} 語</option>
          ))}
        </select>
        <button
          onClick={async () => {
            const r = await sendToBackground('seed', { size });
            setMsg(`${r.added.toLocaleString()} 語を追加しました`);
            onDone();
          }}
        >
          追加
        </button>
        <span class="ok">{msg}</span>
      </div>
    </section>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataManagement({ onChange, compact = false }: { onChange: () => void; compact?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [listText, setListText] = useState('');
  const [listStatus, setListStatus] = useState<ListStatus>('known');

  const doExport = async () => {
    const backup = await sendToBackground('exportBackup', {});
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    download(`eigo-backup-${stamp}.json`, JSON.stringify(backup, null, 1));
    setMsg({ text: `エクスポートしました（既知・無視 ${backup.words.length} 語、カード ${backup.cards.length} 枚）` });
  };

  const doImport = async (file: File) => {
    setMsg(null);
    let backup: Backup;
    let skipped: number;
    try {
      ({ backup, skipped } = validateBackup(JSON.parse(await file.text())));
    } catch (e) {
      setMsg({ text: e instanceof BackupError ? e.message : 'JSON として読み込めませんでした。', error: true });
      return;
    }
    if (mode === 'replace' && !confirm('現在のデータ（既知語・無視リスト・カード・復習履歴・設定）をすべて削除して、バックアップの内容に置き換えます。よろしいですか？')) return;
    const r = await sendToBackground('importBackup', { backup, mode });
    setMsg({
      text: `インポートしました：語 ${r.words}、カード ${r.cards}、復習履歴 ${r.reviews}${skipped ? `（不正なデータ ${skipped} 件をスキップ）` : ''}`,
    });
    onChange();
  };

  const doListImport = async (text: string) => {
    const { words, invalid } = parseWordList(text);
    if (words.length === 0) {
      setMsg({ text: '単語が見つかりませんでした。1行に1語ずつ書いてください。', error: true });
      return;
    }
    const r = await sendToBackground('importWordList', { words, status: listStatus });
    setMsg({
      text: `${r.added.toLocaleString()} 語を${listStatus === 'known' ? '既知語' : '無視リスト'}に追加しました（見出し語化後 ${r.total.toLocaleString()} 語、登録済みを除く）${invalid.length ? `／読み込めない行 ${invalid.length}` : ''}`,
    });
    setListText('');
    onChange();
  };

  return (
    <section>
      <h2>{compact ? 'バックアップから復元' : 'データ管理'}</h2>
      {!compact && (
        <>
          <h3>エクスポート</h3>
          <p class="muted">既知語・無視リスト・カード・復習履歴・設定を JSON ファイルに保存します。</p>
          <button onClick={doExport}>JSON をエクスポート</button>
        </>
      )}

      <h3>インポート（JSON）</h3>
      <div class="inline">
        <label class="check">
          <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
          マージ（新しい方を採用）
        </label>
        <label class="check">
          <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
          置き換え（設定も復元）
        </label>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) void doImport(f);
          (e.target as HTMLInputElement).value = '';
        }}
      />

      <h3>既知語リストの一括インポート（テキスト）</h3>
      <p class="muted">1行に1語。空行と # で始まる行は無視します。活用形は見出し語にそろえて登録します（running → run）。</p>
      <textarea
        class="wordlist"
        placeholder={'apple\nbanana\nrun'}
        value={listText}
        onInput={(e) => setListText((e.target as HTMLTextAreaElement).value)}
      />
      <div class="inline">
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) setListText(await f.text());
            (e.target as HTMLInputElement).value = '';
          }}
        />
        <select value={listStatus} onChange={(e) => setListStatus((e.target as HTMLSelectElement).value as ListStatus)}>
          <option value="known">既知語として登録</option>
          <option value="ignored">無視リストに登録</option>
        </select>
        <button disabled={!listText.trim()} onClick={() => doListImport(listText)}>
          取り込む
        </button>
      </div>
      {msg && <p class={msg.error ? 'error' : 'ok'}>{msg.text}</p>}

      {!compact && (
        <>
          <h3>リセット</h3>
          <button
            class="danger"
            onClick={async () => {
              if (!confirm('すべてのデータ（既知語・無視リスト・カード・復習履歴・設定）を削除します。元に戻せません。続けますか？')) return;
              await sendToBackground('resetAll', {});
              location.hash = '#setup';
              location.reload();
            }}
          >
            すべてのデータを削除
          </button>
        </>
      )}
    </section>
  );
}

function About() {
  const version = browser.runtime.getManifest().version;
  return (
    <section class="muted small">
      <h2>このアプリについて</h2>
      <p>
        eigo v{version} — MIT License。データはすべてこのブラウザの中にだけ保存され、外部には送信されません。
        辞書: EJDict-hand（CC0）／頻出語: wikipedia-word-frequency（MIT）。詳しくは <a href="/THIRD_PARTY_LICENSES.md">THIRD_PARTY_LICENSES.md</a> を参照してください。
      </p>
    </section>
  );
}

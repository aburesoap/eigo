import { useEffect, useState } from 'preact/hooks';
import { CardList } from './CardList';
import { Review } from './Review';

type Tab = 'review' | 'cards';

function tabFromHash(): Tab {
  return location.hash === '#cards' ? 'cards' : 'review';
}

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash());
  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: Tab) => {
    location.hash = t === 'cards' ? '#cards' : '';
    setTab(t);
  };
  return (
    <div class="page">
      <nav class="nav">
        <h1>eigo</h1>
        <button class={`tab ${tab === 'review' ? 'active' : ''}`} onClick={() => go('review')}>復習</button>
        <button class={`tab ${tab === 'cards' ? 'active' : ''}`} onClick={() => go('cards')}>カード一覧</button>
        <span class="spacer" />
        <a href="/options.html">設定・データ管理</a>
      </nav>
      {tab === 'review' ? <Review /> : <CardList />}
    </div>
  );
}

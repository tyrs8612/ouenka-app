'use strict';

/* ============================================================
   定数
   ============================================================ */
const STORAGE_KEYS = {
  FAVORITES:     'ouenka_favorites_v1',
  PRACTICE_LOG:  'ouenka_practice_v1',
  RECENT_PLAYED: 'ouenka_recent_v1',
  SORT_MODE:     'ouenka_sort_v1',
};

const MAX_RECENT = 8; // 最近再生の最大件数

/* ============================================================
   アプリ状態（シングルトン）
   ============================================================ */
const state = {
  players:         [],    // data.json から読み込んだ選手データ
  team:            {},    // チーム情報
  sortMode:        'batting', // 'batting' | 'number'
  currentView:     'home',    // 'home' | 'player' | 'favorites' | 'search'
  currentPlayerId: null,
  searchQuery:     '',
  favorites:       new Set(), // Set<playerId>
  practiceLog:     {},        // { [playerId]: number }
  recentPlayed:    [],        // [playerId, ...] 最新順
  seqIndex:        0,         // 連続再生中のインデックス
  seqPlayers:      [],        // 連続再生対象リスト
};

/* ============================================================
   ローカルストレージ
   ============================================================ */

/** localStorage から永続データを読み込む */
function loadFromStorage() {
  try {
    const fav    = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    const log    = localStorage.getItem(STORAGE_KEYS.PRACTICE_LOG);
    const recent = localStorage.getItem(STORAGE_KEYS.RECENT_PLAYED);
    const sort   = localStorage.getItem(STORAGE_KEYS.SORT_MODE);

    if (fav)    state.favorites     = new Set(JSON.parse(fav));
    if (log)    state.practiceLog   = JSON.parse(log);
    if (recent) state.recentPlayed  = JSON.parse(recent);
    if (sort)   state.sortMode      = sort;
  } catch (e) {
    console.warn('[ouenka] ストレージ読み込みエラー:', e);
  }
}

/** 変更後に localStorage へ書き込む */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITES,     JSON.stringify([...state.favorites]));
    localStorage.setItem(STORAGE_KEYS.PRACTICE_LOG,  JSON.stringify(state.practiceLog));
    localStorage.setItem(STORAGE_KEYS.RECENT_PLAYED, JSON.stringify(state.recentPlayed));
    localStorage.setItem(STORAGE_KEYS.SORT_MODE,     state.sortMode);
  } catch (e) {
    console.warn('[ouenka] ストレージ書き込みエラー:', e);
  }
}

/* ============================================================
   データ取得
   ============================================================ */

/** data.json を fetch してアプリ状態に格納する */
async function fetchData() {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error(`data.json の取得に失敗 (${res.status})`);
  const json = await res.json();
  state.players = json.players || [];
  state.team    = json.team   || {};
}

/* ============================================================
   ルーター（Hash ベース）
   ============================================================ */

/** URL ハッシュを解析してビューを切り替える */
function handleRoute() {
  const hash = location.hash;

  if (!hash || hash === '#/' || hash === '#') {
    state.currentView     = 'home';
    state.currentPlayerId = null;
  } else if (hash === '#/favorites') {
    state.currentView     = 'favorites';
    state.currentPlayerId = null;
  } else if (hash === '#/search') {
    state.currentView     = 'search';
    state.currentPlayerId = null;
  } else if (hash.startsWith('#/player/')) {
    const id = parseInt(hash.replace('#/player/', ''), 10);
    if (!isNaN(id) && state.players.some(p => p.id === id)) {
      state.currentView     = 'player';
      state.currentPlayerId = id;
    } else {
      location.replace('#/');
      return;
    }
  } else {
    location.replace('#/');
    return;
  }

  render();
}

/* ============================================================
   レンダリング（メイン）
   ============================================================ */

/** 現在のビューに応じた HTML を #app に描画する */
function render() {
  const app = document.getElementById('app');

  // ビュー別レンダリング
  switch (state.currentView) {
    case 'home':      app.innerHTML = renderHome();         break;
    case 'player':    app.innerHTML = renderPlayerDetail(); break;
    case 'favorites': app.innerHTML = renderFavorites();    break;
    case 'search':    app.innerHTML = renderSearch();       break;
    default:          app.innerHTML = renderHome();
  }

  // ボトムナビ更新
  renderBottomNav();

  // 選手詳細では最上部へスクロール
  if (state.currentView === 'player') {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // 検索画面では入力欄にフォーカス
  if (state.currentView === 'search') {
    const input = document.getElementById('search-input');
    if (input) {
      // iOS では setTimeout が必要
      setTimeout(() => { try { input.focus(); } catch (_) {} }, 150);
    }
  }
}

/* ============================================================
   ボトムナビゲーション
   ============================================================ */
function renderBottomNav() {
  let nav = document.getElementById('bottom-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'bottom-nav';
    nav.setAttribute('aria-label', 'メインナビゲーション');
    document.body.appendChild(nav);
  }

  const tabs = [
    { view: 'home',       icon: '🏠', label: 'ホーム',     hash: '#/'           },
    { view: 'favorites',  icon: '⭐', label: 'お気に入り', hash: '#/favorites'  },
    { view: 'search',     icon: '🔍', label: '検索',       hash: '#/search'     },
  ];

  nav.innerHTML = tabs.map(tab => `
    <a href="${tab.hash}"
       class="nav-tab ${state.currentView === tab.view ? 'active' : ''}"
       aria-label="${tab.label}"
       aria-current="${state.currentView === tab.view ? 'page' : 'false'}">
      <span class="nav-icon">${tab.icon}</span>
      <span class="nav-label">${tab.label}</span>
    </a>
  `).join('');
}

/* ============================================================
   ホーム画面
   ============================================================ */
function renderHome() {
  const sortedPlayers = getSortedPlayers();
  const nextPlayer    = getNextToLearn();

  return `
    <div class="view-home">
      <!-- ヒーローイメージ（漫画風フレーム） -->
      <div class="hero-banner">
        <div class="hero-frame">
          <img src="hero.jpg" alt="バットでボールを打つ選手のイラスト"
               class="hero-img" width="800" height="767" loading="eager">
          <div class="hero-overlay"></div>
          <div class="hero-fx" aria-hidden="true">
            <span class="fx-word">カキーン！</span>
          </div>
        </div>
      </div>

      <!-- ヘッダー -->
      <header class="app-header">
        <div class="header-badge">⚾ ${state.team.year || 2026}</div>
        <h1 class="header-title">${esc(state.team.name)}</h1>
        <p class="header-subtitle">${esc(state.team.subtitle)}</p>
        ${renderDailyMessage()}
      </header>

      <!-- 全員連続再生ボタン（YouTubeプレイリストを開く） -->
      <section class="action-section" aria-label="メインアクション">
        <button class="btn-sequential" id="btn-sequential"
                aria-label="全選手の応援歌を連続再生（YouTubeプレイリスト）">
          <span class="btn-icon">▶</span>
          <span class="btn-text">全員連続再生</span>
          <span class="btn-sub">全${state.players.length}曲を自動再生</span>
        </button>
      </section>

      <!-- 練習スタンプカード -->
      ${renderStampCard()}

      <!-- 次に覚える曲 -->
      ${nextPlayer ? renderNextToLearn(nextPlayer) : ''}

      <!-- 最近再生 -->
      ${renderRecentSection()}

      <!-- 選手一覧（背番号順） -->
      <div class="section-label" style="padding-top:20px;">⚾ 選手一覧（背番号順）</div>
      <section class="player-list" aria-label="選手一覧">
        ${sortedPlayers.map(p => renderPlayerCard(p)).join('')}
      </section>

      <div class="nav-spacer"></div>
    </div>
  `;
}

/**
 * 練習スタンプカード
 * 1回以上再生した選手に ⚾ スタンプを付与。全員達成でお祝い表示。
 */
function renderStampCard() {
  const total     = state.players.length;
  const sorted    = getSortedPlayers();
  const doneCount = sorted.filter(p => (state.practiceLog[p.id] || 0) > 0).length;
  const allDone   = doneCount === total && total > 0;
  const percent   = total ? Math.round((doneCount / total) * 100) : 0;

  // スタンプのマス目（各選手＝1マス）
  const stamps = sorted.map(p => {
    const done = (state.practiceLog[p.id] || 0) > 0;
    return `
      <a href="#/player/${p.id}"
         class="stamp-cell ${done ? 'done' : ''}"
         aria-label="${esc(displayName(p))} ${done ? '練習済み' : '未練習'}">
        <span class="stamp-mark">${done ? '⚾' : p.number}</span>
      </a>`;
  }).join('');

  return `
    <section class="stamp-section" aria-label="練習スタンプカード">
      <div class="stamp-header">
        <div class="section-label" style="padding:0;">🏅 練習スタンプカード</div>
        <div class="stamp-count">${doneCount} / ${total} 人</div>
      </div>

      <!-- 達成率に応じた関西弁の煽り -->
      <div class="stamp-taunt">${esc(getStampTaunt(percent))}</div>

      <!-- 進捗バー -->
      <div class="stamp-progress-track" role="progressbar"
           aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"
           aria-label="達成率 ${percent}パーセント">
        <div class="stamp-progress-fill" style="width:${percent}%;"></div>
      </div>

      ${allDone ? `
        <div class="stamp-complete">
          🎉 全員覚えたやん！ほな全国いこか！🔥
        </div>
      ` : ''}

      <!-- スタンプのマス -->
      <div class="stamp-grid">
        ${stamps}
      </div>

      <p class="stamp-hint">
        各選手の応援歌をYouTubeで1回再生すると ⚾ スタンプが付くで！
      </p>
      ${doneCount > 0 ? `
        <button class="stamp-reset" data-action="reset-stamps"
                aria-label="練習記録をすべてリセット">
          スタンプをリセット
        </button>
      ` : ''}
    </section>
  `;
}

/** 達成率に応じた関西弁の煽り文句 */
function getStampTaunt(percent) {
  if (percent === 0)   return 'まだ0人…ここからやで！💪';
  if (percent < 30)    return 'まだまだこれからやん！';
  if (percent < 60)    return 'ええ感じになってきたで〜！';
  if (percent < 100)   return 'あと少し！気ぃ抜くな！🔥';
  return '甲子園級の仕上がりや！！⚾';
}

/** 次に覚える曲カード */
function renderNextToLearn(player) {
  const proInfo = buildProInfo(player);
  return `
    <section class="next-learn-section" aria-label="次に覚える曲">
      <div class="section-label">💡 次に覚える曲</div>
      <a href="#/player/${player.id}" class="next-learn-card"
         aria-label="${esc(displayName(player))} の応援歌を練習する">
        <div class="next-number">${player.number}</div>
        <div class="next-info">
          <div class="next-name">${esc(displayName(player))}</div>
          <div class="next-pro">${esc(proInfo)}</div>
        </div>
        <div class="next-count">練習 ${state.practiceLog[player.id] || 0}回</div>
        <span class="next-arrow" aria-hidden="true">›</span>
      </a>
    </section>
  `;
}

/** 最近再生セクション */
function renderRecentSection() {
  const recentPlayers = state.recentPlayed
    .slice(0, MAX_RECENT)
    .map(id => state.players.find(p => p.id === id))
    .filter(Boolean);

  if (recentPlayers.length === 0) return '';

  return `
    <section class="recent-section" aria-label="最近再生した選手">
      <div class="section-label">🕐 最近再生</div>
      <div class="recent-scroll" role="list">
        ${recentPlayers.map(p => `
          <a href="#/player/${p.id}" class="recent-chip" role="listitem"
             aria-label="${esc(displayName(p))}">
            <span class="recent-chip-num">${p.number}</span>
            <span class="recent-chip-name">${esc(displayName(p))}</span>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

/* ============================================================
   選手カード（共通部品）
   ============================================================ */
function renderPlayerCard(player) {
  const isFav   = state.favorites.has(player.id);
  const count   = state.practiceLog[player.id] || 0;
  const proInfo = buildProInfo(player);

  return `
    <article class="player-card" data-player-id="${player.id}">
      <a href="#/player/${player.id}" class="player-card-link"
         aria-label="${esc(displayName(player))}（背番号${player.number}）の応援歌">
        <div class="card-number" aria-hidden="true">${player.number}</div>
        <div class="card-info">
          <div class="card-name">${esc(displayName(player))}</div>
          <div class="card-pro">${esc(proInfo)}</div>
          ${count > 0
            ? `<div class="card-count">🎵 ${count}回練習済み</div>`
            : ''}
        </div>
        <div class="card-actions" aria-hidden="true">
          ${isFav ? '<span class="card-fav-badge">⭐</span>' : ''}
          <span class="card-play-btn">▶</span>
        </div>
      </a>
    </article>
  `;
}

/* ============================================================
   選手詳細画面
   ============================================================ */
function renderPlayerDetail() {
  const player = state.players.find(p => p.id === state.currentPlayerId);
  if (!player) {
    return `<div class="error-screen">
      <div class="error-icon">😵</div>
      <p>選手が見つかりません</p>
      <button onclick="location.hash='#/'">ホームへ戻る</button>
    </div>`;
  }

  const isFav      = state.favorites.has(player.id);
  const count      = state.practiceLog[player.id] || 0;
  const proInfo    = buildProInfo(player);
  const lyricsHtml = esc(player.lyrics).replace(/\n/g, '<br>');

  // 前後の選手（現在のソート順を維持）
  const sorted      = getSortedPlayers();
  const currentIdx  = sorted.findIndex(p => p.id === player.id);
  const prevPlayer  = currentIdx > 0                ? sorted[currentIdx - 1] : null;
  const nextPlayer  = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;

  return `
    <div class="view-player">
      <!-- ヘッダー -->
      <div class="player-header">
        <a href="#/" class="back-btn" aria-label="ホームに戻る">‹ 戻る</a>
        <button class="fav-btn ${isFav ? 'active' : ''}"
                data-action="toggle-fav"
                data-player-id="${player.id}"
                aria-label="${isFav ? 'お気に入りを解除' : 'お気に入りに追加'}"
                aria-pressed="${isFav}">
          ${isFav ? '⭐' : '☆'}
        </button>
      </div>

      <!-- ヒーローセクション：スコアボード番号 + 選手情報 -->
      <div class="player-hero">
        <div class="player-number-display" aria-label="背番号 ${player.number}">
          ${player.number}
        </div>
        <div class="player-hero-info">
          <h1 class="player-name">${esc(displayName(player))}</h1>
          <div class="player-pro-badge">${esc(proInfo)}</div>
          <div class="practice-badge" aria-live="polite" aria-atomic="true">
            🎵 練習 <strong>${count}</strong> 回
          </div>
        </div>
      </div>

      <!-- 歌詞 -->
      <section class="lyrics-section" aria-label="応援歌歌詞">
        <div class="lyrics-label">📋 応援歌歌詞</div>
        <div class="lyrics-body">${lyricsHtml}</div>
      </section>

      <!-- ページ内プレイヤー（YouTube公式埋め込み） -->
      <section class="player-embed-section" aria-label="応援歌をここで再生">
        <div class="lyrics-label">🎵 ここですぐ聴く</div>
        ${renderYoutubeEmbed(player, getYoutubeId(player.youtube), '応援歌を再生')}
        ${player.youtubeAlt
          ? renderYoutubeEmbed(player, getYoutubeId(player.youtubeAlt), '別バージョン（聴きやすい）')
          : ''}
      </section>

      <!-- YouTubeアプリで開く（別タブ） -->
      <section class="youtube-section" aria-label="YouTube で開く">
        <button class="btn-youtube"
                data-action="open-youtube"
                data-url="${esc(player.youtube)}"
                data-player-id="${player.id}"
                aria-label="${esc(displayName(player))} の応援歌を YouTube で開く">
          <span class="yt-icon">▶</span>
          YouTubeアプリで開く
        </button>
        ${player.youtubeAlt ? `
          <button class="btn-youtube-alt"
                  data-action="open-youtube"
                  data-url="${esc(player.youtubeAlt)}"
                  data-player-id="${player.id}"
                  aria-label="聴きやすい別バージョンを YouTube で開く">
            <span class="yt-icon">▶</span>
            別バージョンをYouTubeで開く
          </button>
        ` : ''}
      </section>

      <!-- 前後ナビゲーション -->
      <nav class="player-nav" aria-label="選手ナビゲーション">
        ${prevPlayer ? `
          <a href="#/player/${prevPlayer.id}" class="player-nav-btn prev"
             aria-label="前の選手 ${esc(displayName(prevPlayer))}">
            <span class="nav-arrow" aria-hidden="true">‹</span>
            <span class="nav-btn-info">
              <span class="nav-btn-label">前の選手</span>
              <span class="nav-btn-name">${esc(displayName(prevPlayer))}</span>
            </span>
          </a>
        ` : '<div class="player-nav-placeholder" aria-hidden="true"></div>'}

        ${nextPlayer ? `
          <a href="#/player/${nextPlayer.id}" class="player-nav-btn next"
             aria-label="次の選手 ${esc(displayName(nextPlayer))}">
            <span class="nav-btn-info">
              <span class="nav-btn-label">次の選手</span>
              <span class="nav-btn-name">${esc(displayName(nextPlayer))}</span>
            </span>
            <span class="nav-arrow" aria-hidden="true">›</span>
          </a>
        ` : '<div class="player-nav-placeholder" aria-hidden="true"></div>'}
      </nav>

      <div class="nav-spacer"></div>
    </div>
  `;
}

/* ============================================================
   お気に入り画面
   ============================================================ */
function renderFavorites() {
  const favPlayers = getSortedPlayers().filter(p => state.favorites.has(p.id));

  return `
    <div class="view-favorites">
      <header class="sub-header">
        <h2 class="sub-header-title">⭐ お気に入り</h2>
      </header>

      ${favPlayers.length === 0 ? `
        <div class="empty-state" role="status">
          <div class="empty-icon">☆</div>
          <p class="empty-title">お気に入りがありません</p>
          <p class="empty-desc">選手の詳細画面で ☆ をタップして<br>お気に入りに追加できます</p>
          <a href="#/" class="btn-go-home">選手一覧へ</a>
        </div>
      ` : `
        <section class="player-list" style="padding-top:16px;"
                 aria-label="お気に入り選手 ${favPlayers.length}人">
          ${favPlayers.map(p => renderPlayerCard(p)).join('')}
        </section>
      `}

      <div class="nav-spacer"></div>
    </div>
  `;
}

/* ============================================================
   検索画面
   ============================================================ */
function renderSearch() {
  const query   = state.searchQuery.trim();
  const results = query ? searchPlayers(query) : [];

  let resultHtml = '';
  if (query === '') {
    resultHtml = `
      <div class="search-hint">
        <p>なまえ（例：はやた）、背番号（例：10）<br>
           プロ選手名（例：鈴木誠也）で検索できます</p>
      </div>`;
  } else if (results.length === 0) {
    resultHtml = `
      <div class="empty-state" role="status">
        <div class="empty-icon">🔍</div>
        <p class="empty-title">「${esc(query)}」は見つかりませんでした</p>
        <p class="empty-desc">別のキーワードで検索してみてください</p>
      </div>`;
  } else {
    resultHtml = `
      <section class="player-list" style="padding-top:16px;"
               aria-label="検索結果 ${results.length}件">
        ${results.map(p => renderPlayerCard(p)).join('')}
      </section>`;
  }

  return `
    <div class="view-search">
      <header class="sub-header">
        <h2 class="sub-header-title">🔍 検索</h2>
      </header>

      <div class="search-box-wrap">
        <input type="search" id="search-input" class="search-input"
               placeholder="なまえ・背番号・プロ選手名..."
               value="${esc(state.searchQuery)}"
               autocomplete="off"
               autocorrect="off"
               autocapitalize="off"
               spellcheck="false"
               aria-label="選手を検索"
               inputmode="search">
      </div>

      <div id="search-results">
        ${resultHtml}
      </div>

      <div class="nav-spacer"></div>
    </div>
  `;
}

/* ============================================================
   連続再生モーダル
   ============================================================ */

/** モーダルを開き、打順 1 番目から開始 */
function openSequentialModal() {
  state.seqPlayers = [...state.players].sort((a, b) => a.battingOrder - b.battingOrder);
  state.seqIndex   = 0;
  updateSeqModal();

  const modal = document.getElementById('sequential-modal');
  if (!modal) return; // 旧モーダルは廃止済み
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  // フォーカストラップ
  const firstFocusable = modal.querySelector('#seq-open-yt');
  if (firstFocusable) firstFocusable.focus();
}

/** モーダルを閉じる */
function closeSequentialModal() {
  const modal = document.getElementById('sequential-modal');
  if (!modal) return; // 旧モーダルは廃止済み（存在しなくても安全に無視）
  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';

  // フォーカスを連続再生ボタンに戻す
  const btn = document.getElementById('btn-sequential');
  if (btn) btn.focus();
}

/** モーダル内のコンテンツを現在の選手で更新 */
function updateSeqModal() {
  const player = state.seqPlayers[state.seqIndex];
  if (!player) { closeSequentialModal(); return; }

  const total   = state.seqPlayers.length;
  const current = state.seqIndex + 1;
  const proInfo = buildProInfo(player);
  const isLast  = state.seqIndex >= total - 1;

  // 進捗ドット
  const progressEl = document.getElementById('seq-progress');
  if (progressEl) {
    const dots = state.seqPlayers.map((_, i) =>
      `<span class="seq-dot ${i === state.seqIndex ? 'active' : i < state.seqIndex ? 'done' : ''}"></span>`
    ).join('');
    progressEl.innerHTML = `${dots}<span class="seq-count">${current} / ${total}</span>`;
  }

  // 各テキスト要素
  setText('seq-number', `#${player.number}`);
  setText('seq-name',   displayName(player));
  setText('seq-pro',    proInfo);

  const lyricsEl = document.getElementById('seq-lyrics');
  if (lyricsEl) lyricsEl.innerHTML = esc(player.lyrics).replace(/\n/g, '<br>');

  // ボタンにデータ属性を設定
  const ytBtn = document.getElementById('seq-open-yt');
  if (ytBtn) {
    ytBtn.dataset.url      = player.youtube;
    ytBtn.dataset.playerId = player.id;
  }

  const nextBtn = document.getElementById('seq-next');
  if (nextBtn) {
    nextBtn.textContent     = isLast ? '✓ 完了' : '次の選手 →';
    nextBtn.dataset.isLast  = isLast;
  }
}

/* ============================================================
   アクション関数
   ============================================================ */

/** お気に入りをトグル */
function toggleFavorite(playerIdStr) {
  const id = parseInt(playerIdStr, 10);
  if (!id) return;

  if (state.favorites.has(id)) {
    state.favorites.delete(id);
  } else {
    state.favorites.add(id);
  }
  saveToStorage();

  // DOM を直接更新（全再レンダリング不要）
  const btn  = document.querySelector(`[data-action="toggle-fav"][data-player-id="${id}"]`);
  const isFav = state.favorites.has(id);

  if (btn) {
    btn.classList.toggle('active', isFav);
    btn.textContent = isFav ? '⭐' : '☆';
    btn.setAttribute('aria-pressed', String(isFav));
    btn.setAttribute('aria-label', isFav ? 'お気に入りを解除' : 'お気に入りに追加');
    btn.classList.remove('bounce');
    // アニメーション再トリガー
    void btn.offsetWidth;
    btn.classList.add('bounce');
  }

  // 一覧画面の ⭐ バッジも更新
  const cardBadgeArea = document.querySelector(
    `.player-card[data-player-id="${id}"] .card-actions`
  );
  if (cardBadgeArea) {
    const badge = cardBadgeArea.querySelector('.card-fav-badge');
    if (isFav && !badge) {
      const span = document.createElement('span');
      span.className = 'card-fav-badge';
      span.textContent = '⭐';
      cardBadgeArea.insertBefore(span, cardBadgeArea.firstChild);
    } else if (!isFav && badge) {
      badge.remove();
    }
  }
}

/** YouTube を新しいタブで開き、練習カウントを記録 */
function openYoutube(url, playerIdStr) {
  if (!url) return;
  popRandomCheer(); // 関西弁の掛け声をポップ
  window.open(url, '_blank', 'noopener,noreferrer');
  recordPlay(playerIdStr);
}

/**
 * サムネイルを本物のYouTubeプレイヤー（iframe）に差し替えて再生する
 * ユーザーのタップが起点なので autoplay が許可される
 */
function playEmbed(wrap) {
  if (!wrap) return;
  const videoId  = wrap.dataset.videoId;
  const playerId = wrap.dataset.playerId;
  if (!videoId) return;

  // すでに再生中なら何もしない
  if (wrap.querySelector('iframe')) return;

  const iframe = document.createElement('iframe');
  iframe.className = 'yt-embed-iframe';
  // youtube-nocookie を使い、プライバシー強化モードで埋め込む
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
             + '?autoplay=1&rel=0&playsinline=1&modestbranding=1';
  iframe.title = '応援歌プレイヤー';
  iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';

  // サムネイルを消してプレイヤーを差し込む
  wrap.innerHTML = '';
  wrap.appendChild(iframe);

  // 練習カウント＆ガチャ券（外部で開いたときと同じ扱い）
  popRandomCheer();
  recordPlay(playerId);
}

/** 練習カウントを +1 し、最近再生・ガチャ券を更新 */
function recordPlay(playerIdStr) {
  const id = parseInt(playerIdStr, 10);
  if (!id) return;

  state.practiceLog[id]  = (state.practiceLog[id] || 0) + 1;
  state.recentPlayed     = [id, ...state.recentPlayed.filter(x => x !== id)].slice(0, MAX_RECENT);
  saveToStorage();

  // 詳細画面のバッジをリアルタイム更新
  const strong = document.querySelector('.practice-badge strong');
  if (strong) {
    strong.textContent = state.practiceLog[id];
    const badge = strong.closest('.practice-badge');
    if (badge) {
      badge.classList.remove('pulse');
      void badge.offsetWidth;
      badge.classList.add('pulse');
    }
  }
}

/* ============================================================
   ユーティリティ
   ============================================================ */

/** 現在のソートモードで選手リストを並べ替えて返す */
function getSortedPlayers() {
  // 打順は試合ごとに変わるため、常に背番号順で表示する
  return [...state.players].sort((a, b) => a.number - b.number);
}

/** 練習回数が最も少ない選手を返す（0回の選手優先） */
function getNextToLearn() {
  if (state.players.length === 0) return null;
  return [...state.players].sort((a, b) => {
    const ca = state.practiceLog[a.id] || 0;
    const cb = state.practiceLog[b.id] || 0;
    return ca - cb;
  })[0];
}

/** 名前・番号・プロ選手名で選手を検索 */
function searchPlayers(query) {
  const q = query.toLowerCase();
  return state.players.filter(p =>
    p.name.includes(query)             ||
    p.name.toLowerCase().includes(q)   ||
    (p.nameKana  && p.nameKana.includes(query))  ||
    (p.nameShort && p.nameShort.includes(query)) ||
    String(p.number).includes(query)   ||
    (p.proName  && p.proName.includes(query))    ||
    (p.proTeam  && p.proTeam.includes(query))    ||
    p.lyrics.includes(query)
  );
}

/** 「プロ球団 プロ選手名」の文字列を生成 */
function buildProInfo(player) {
  if (player.proTeam && player.proName) {
    return `${player.proTeam} ${player.proName}`;
  }
  return 'オリジナル';
}

/* ============================================================
   関西エンタメ要素
   ============================================================ */

/** 今日の応援メッセージ（関西弁・熱い＆おもろい） */
const DAILY_MESSAGES = [
  '今日も気合い入れて覚えていこか！🔥',
  'ええか、応援は声出してナンボやで！📣',
  '全国目指して、いてまえ〜！⚾',
  '声が枯れるまで歌うんが応援や！',
  'ほな、今日の一曲いっとこか！',
  '甲子園はもう目の前やで！気ぃ抜くな！',
  '親の本気、子どもに見せたるんや！💪',
  'ナイスバッチ！…の前にまず歌覚えよ！',
  'テンション上げてこ〜！いてまえAT魂！',
  'この応援で球場ぜんぶ味方につけたるで！',
];

/** 再生時の関西弁の掛け声（ランダム） */
const CHEER_SHOUTS = [
  'ええぞ〜！', 'かっとばせ〜！', 'いてまえ！', 'ナイスや！',
  'その調子や！', 'ホームランや！', 'よっしゃ行こか！', 'たまらんな〜！',
  '球場沸かせ！', '声出していこ！',
];

/** 効果音（カードタップ時の漫画風演出） */
const SFX_WORDS = ['カキーン！', 'ズバッ！', 'ドーン！', 'バシィ！', 'いてまえ！'];

/** 今日のメッセージを日付ベースで選ぶ（1日1メッセージで安定） */
function renderDailyMessage() {
  const dayIndex = new Date().getDate() % DAILY_MESSAGES.length;
  const msg = DAILY_MESSAGES[dayIndex];
  return `<div class="daily-message" aria-label="今日の応援メッセージ">${esc(msg)}</div>`;
}

/** 画面に一瞬だけ関西弁の掛け声をポップ表示 */
function showCheerToast(text) {
  const toast = document.createElement('div');
  toast.className = 'cheer-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  // アニメーション後に削除
  setTimeout(() => toast.remove(), 1400);
}

/** ランダムな掛け声を表示 */
function popRandomCheer() {
  const shout = CHEER_SHOUTS[Math.floor(Math.random() * CHEER_SHOUTS.length)];
  showCheerToast(shout);
}

/** 画面に漫画風の効果音を弾けさせる（タップ位置付近） */
function popSfx(x, y) {
  const word = SFX_WORDS[Math.floor(Math.random() * SFX_WORDS.length)];
  const el = document.createElement('div');
  el.className = 'sfx-pop';
  el.textContent = word;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

/** 表示用の名前（プライバシー配慮でひらがなの呼び名を使う） */
function displayName(player) {
  return player.nameKana || player.nameShort || player.name;
}

/**
 * YouTube URL から動画IDを取り出す
 * 対応: youtu.be/XXX, watch?v=XXX, /shorts/XXX
 */
function getYoutubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([\w-]{6,})/,      // 短縮URL
    /[?&]v=([\w-]{6,})/,           // watch?v=
    /\/shorts\/([\w-]{6,})/,       // ショート動画
    /\/embed\/([\w-]{6,})/,        // 埋め込みURL
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * YouTube 埋め込みプレイヤーのHTMLを生成
 * 遅延読み込み（クリックするまでiframeを作らない）で表示を軽くする
 */
function renderYoutubeEmbed(player, videoId, label) {
  if (!videoId) return '';
  // サムネイルはYouTube公式のものを使用
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return `
    <div class="yt-embed" data-video-id="${esc(videoId)}"
         data-player-id="${player.id}">
      <!-- クリック前：サムネイル + 再生ボタン（iframeはまだ作らない） -->
      <button class="yt-embed-poster" data-action="play-embed"
              aria-label="${esc(label)}をここで再生">
        <img src="${thumb}" alt="" class="yt-embed-thumb" loading="lazy">
        <span class="yt-embed-shade"></span>
        <span class="yt-embed-play">▶</span>
        <span class="yt-embed-label">${esc(label)}</span>
      </button>
    </div>
  `;
}

/** XSS 対策の HTML エスケープ */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/** 要素のテキストコンテンツを安全に設定 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ============================================================
   グローバルイベントリスナー（委譲）
   ============================================================ */

/** 全クリックイベントを document レベルで処理 */
function handleGlobalClick(e) {
  /* --- 選手カード／スタンプ／ナビをタップしたら漫画風効果音を弾く --- */
  const tappable = e.target.closest('.player-card-link, .stamp-cell, .next-learn-card');
  if (tappable) {
    const px = (e.clientX || (window.innerWidth / 2));
    const py = (e.clientY || (window.innerHeight / 2));
    popSfx(px, py);
    // 遷移自体は止めない（リンクはそのまま動く）
  }

  /* --- data-action 属性によるイベント処理 --- */
  const actionTarget = e.target.closest('[data-action]');
  if (actionTarget) {
    const action = actionTarget.dataset.action;

    if (action === 'toggle-fav') {
      e.preventDefault();
      toggleFavorite(actionTarget.dataset.playerId);
      return;
    }

    if (action === 'open-youtube') {
      e.preventDefault();
      openYoutube(actionTarget.dataset.url, actionTarget.dataset.playerId);
      return;
    }

    if (action === 'reset-stamps') {
      e.preventDefault();
      if (confirm('練習スタンプをすべてリセットしますか？（最近再生も消えます）')) {
        state.practiceLog  = {};
        state.recentPlayed = [];
        saveToStorage();
        render();
      }
      return;
    }

    if (action === 'play-embed') {
      e.preventDefault();
      playEmbed(actionTarget.closest('.yt-embed'));
      return;
    }
  }

  /* --- 全員連続再生ボタン（YouTubeプレイリストを開く） --- */
  if (e.target.closest('#btn-sequential')) {
    e.preventDefault();
    const url = state.team.playlistUrl;
    if (url) {
      showCheerToast('全員いくで〜！🔥');
      // プレイリストを新しいタブで開く → YouTube側で自動的に次の曲へ進む
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      alert('プレイリストが設定されていません。data.json の playlistUrl をご確認ください。');
    }
    return;
  }

  /* --- モーダル：閉じる / 背景クリック --- */
  if (e.target.closest('#seq-close') || e.target.id === 'seq-backdrop') {
    closeSequentialModal();
    return;
  }

  /* --- モーダル：YouTube を開く --- */
  if (e.target.closest('#seq-open-yt')) {
    const btn = e.target.closest('#seq-open-yt');
    openYoutube(btn.dataset.url, btn.dataset.playerId);
    return;
  }

  /* --- モーダル：次の選手 / 完了 --- */
  if (e.target.closest('#seq-next')) {
    const btn = e.target.closest('#seq-next');
    if (btn.dataset.isLast === 'true') {
      closeSequentialModal();
    } else {
      state.seqIndex++;
      updateSeqModal();
    }
    return;
  }
}

/** 検索入力（デバウンス付き） */
let searchTimer = null;
function handleGlobalInput(e) {
  if (e.target.id !== 'search-input') return;
  state.searchQuery = e.target.value;

  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const query   = state.searchQuery.trim();
    const results = query ? searchPlayers(query) : [];
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    if (query === '') {
      resultsContainer.innerHTML = `
        <div class="search-hint">
          <p>なまえ（例：はやた）、背番号（例：10）<br>
             プロ選手名（例：鈴木誠也）で検索できます</p>
        </div>`;
    } else if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state" role="status">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">「${esc(query)}」は見つかりませんでした</p>
          <p class="empty-desc">別のキーワードで検索してみてください</p>
        </div>`;
    } else {
      resultsContainer.innerHTML = `
        <section class="player-list" style="padding-top:16px;"
                 aria-label="検索結果 ${results.length}件">
          ${results.map(p => renderPlayerCard(p)).join('')}
        </section>`;
    }
  }, 180); // 180ms デバウンス
}

/** キーボード操作 */
function handleKeydown(e) {
  if (e.key === 'Escape') closeSequentialModal();
}

/* ============================================================
   Service Worker 登録
   ============================================================ */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('[ouenka] SW 登録完了:', reg.scope))
      .catch(err => console.warn('[ouenka] SW 登録失敗:', err));
  }
}

/* ============================================================
   アプリ起動
   ============================================================ */
async function init() {
  // 永続データを先に読む（レンダリング前に必要）
  loadFromStorage();

  try {
    await fetchData();
  } catch (err) {
    console.error('[ouenka] データ読み込みエラー:', err);
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="error-screen">
        <div class="error-icon">⚠️</div>
        <p>データの読み込みに失敗しました。<br>ページを再読み込みしてください。</p>
        <button onclick="location.reload()">再読み込み</button>
      </div>`;
    return;
  }

  // グローバルイベントを一度だけ登録
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('input', handleGlobalInput);
  document.addEventListener('keydown', handleKeydown);

  // ハッシュ変化でルーティング
  window.addEventListener('hashchange', handleRoute);

  // 初回ルーティング
  handleRoute();

  // Service Worker
  registerSW();
}

// DOM 読み込み完了後に起動
document.addEventListener('DOMContentLoaded', init);

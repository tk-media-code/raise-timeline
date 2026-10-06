// ハッシュルーター、認証の振り分け、レイアウト、起動。
(function () {
  'use strict';

  const { el, avatar } = RT.ui;

  // access: 'auth' は要ログイン、'guest' はログイン済みなら #/ へ、'public' は誰でも
  // view は RT.views の関数名。見つからない画面（まだ作っていない画面を含む）は notFound
  const ROUTES = [
    { pattern: '/', view: 'home', access: 'auth' },
    { pattern: '/login', view: 'login', access: 'guest' },
    { pattern: '/register', view: 'register', access: 'guest' },
    { pattern: '/posts/:id', view: 'postDetail', access: 'auth' },
    { pattern: '/posts/:id/likes', view: 'likers', access: 'auth' },
    { pattern: '/users/:username', view: 'profile', access: 'auth' },
    { pattern: '/users/:username/followers', view: 'followers', access: 'auth' },
    { pattern: '/users/:username/following', view: 'following', access: 'auth' },
    { pattern: '/settings/profile', view: 'profileEdit', access: 'auth' },
    { pattern: '/search', view: 'search', access: 'auth' },
  ].map((r) => ({
    ...r,
    regex: new RegExp('^' + r.pattern.replace(/:(\w+)/g, '([^/]+)') + '$'),
    keys: [...r.pattern.matchAll(/:(\w+)/g)].map((m) => m[1]),
  }));

  // '#/users/alice?x=1' を { path, params, query } に分ける。params は route() が埋める
  function parseHash(hash) {
    const raw = (hash || '').replace(/^#/, '') || '/';
    const [path, search = ''] = raw.split('?');
    const query = {};
    new URLSearchParams(search).forEach((v, k) => { query[k] = v; });
    return { path: path || '/', params: {}, query };
  }

  function matchRoute(path) {
    for (const r of ROUTES) {
      const m = r.regex.exec(path);
      if (m) {
        const params = {};
        try {
          r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        } catch (err) {
          if (err instanceof URIError) return null; // '%' だけなど壊れた形は、無い URL として扱う
          throw err;
        }
        return { route: r, params };
      }
    }
    return null;
  }

  // 外部サイトへ飛ばされないよう、/ で始まり // と /\ で始まらない値だけ使う
  function isSafeNext(next) {
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\');
  }

  function navigate(hash, { replace } = {}) {
    if (location.hash === hash) return route();
    if (replace) location.replace(hash);
    else location.hash = hash;
  }

  function route() {
    try {
      const ctx = parseHash(location.hash);
      const found = matchRoute(ctx.path);
      const user = RT.store.currentUser();

      if (found && found.route.access === 'auth' && !user) {
        return navigate('#/login?next=' + encodeURIComponent(location.hash.slice(1) || '/'), { replace: true });
      }
      if (found && found.route.access === 'guest' && user) {
        return navigate('#/', { replace: true });
      }

      const view = found && RT.views[found.route.view];
      ctx.params = view ? found.params : {};
      const { title, el: content } = (view || RT.views.notFound)(ctx);
      const withNav = view && found.route.access === 'auth';
      mount(withNav ? layout(content, { title }) : content, title);
    } catch (err) {
      console.error(err);
      mount(errorScreen(), '問題が起きました');
    }
  }

  // 描画そのものの例外（docs/error-handling-design.md 4 章）。ナビの無い画面で、再読み込みと見本データへの復旧を出す
  function errorScreen() {
    const reload = el('button', { type: 'button', class: 'btn btn-primary btn-block', text: '再読み込み' });
    reload.addEventListener('click', () => location.reload());
    const reset = el('button', { type: 'button', class: 'btn btn-block', text: '見本データに戻す' });
    reset.addEventListener('click', () => {
      try {
        RT.store.reset();
      } catch (err) {
        console.error(err);
        try { localStorage.clear(); } catch (e) { /* 何もできない */ }
      }
      location.hash = '#/login';
      location.reload();
    });
    return el('div', { class: 'auth' },
      el('div', { class: 'auth-card' },
        el('p', { class: 'auth-logo', text: 'raise-timeline' }),
        el('h1', { class: 'auth-title', text: '問題が起きました' }),
        el('p', { class: 'auth-text', text: '再読み込みしてください' }),
        el('div', { class: 'error-actions' }, reload, reset)));
  }

  function mount(node, title) {
    const app = document.getElementById('app');
    app.replaceChildren(node);
    document.title = title + ' - raise-timeline';
    window.scrollTo(0, 0);
  }

  // ---- レイアウト ----
  async function logout() {
    const ok = await RT.ui.confirm({ title: 'ログアウトしますか？', confirmLabel: 'ログアウト' });
    if (!ok) return;
    RT.store.logout();
    navigate('#/login');
  }

  async function resetData() {
    const ok = await RT.ui.confirm({
      title: '見本データに戻しますか？',
      description: '投稿やフォローなど、これまでの変更はすべて消えます。',
      confirmLabel: '戻す',
    });
    if (!ok) return;
    RT.store.reset();
    navigate('#/login');
    RT.ui.toast('見本データに戻しました');
  }

  // 投稿フォームをダイアログで開く。スマホの＋ボタンと PC の「投稿する」の入り口
  function openComposer() {
    const form = RT.ui.composeForm({
      onPosted: () => {
        dialog.close();
        RT.ui.toast('投稿しました');
        route(); // 表示中の画面を読み直して、新しい投稿を出す
      },
    });
    const closeBtn = el('button', { type: 'button', class: 'icon-btn dialog-close', 'aria-label': '閉じる', text: '×' });
    const dialog = el('dialog', { class: 'dialog dialog-wide', 'aria-labelledby': 'compose-title' },
      el('div', { class: 'dialog-body' },
        el('div', { class: 'dialog-head' },
          el('h2', { id: 'compose-title', class: 'dialog-title', text: '新しい投稿' }),
          closeBtn),
        form));
    closeBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    document.getElementById('dialogs').append(dialog);
    dialog.showModal();
    form.focusBody();
  }

  function navItems(user) {
    return [
      { label: 'ホーム', href: '#/', icon: '⌂', match: (p) => p === '/' },
      { label: '検索', href: '#/search', icon: '⌕', match: (p) => p === '/search' },
      { label: 'プロフィール', href: '#/users/' + encodeURIComponent(user.username), icon: '☺', match: (p) => p.startsWith('/users/') && p.split('/')[2].toLowerCase() === encodeURIComponent(user.username).toLowerCase() },
    ];
  }

  function navLink(item, path, className) {
    return el('a', { href: item.href, class: className, 'aria-current': item.match(path) ? 'page' : false },
      el('span', { class: 'nav-icon', 'aria-hidden': 'true', text: item.icon }),
      el('span', { text: item.label }));
  }

  function menuButton() {
    const toggle = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'メニュー', 'aria-expanded': 'false', 'aria-haspopup': 'true', text: '≡' });
    const logoutItem = el('button', { type: 'button', class: 'menu-item', text: 'ログアウト' });
    const resetItem = el('button', { type: 'button', class: 'menu-item', text: '見本データに戻す' });
    const menu = el('div', { class: 'menu', hidden: true }, logoutItem, resetItem);
    const wrap = el('div', { class: 'menu-wrap' }, toggle, menu);

    const close = () => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
    });
    const onOutsideClick = (e) => {
      if (!wrap.isConnected) document.removeEventListener('click', onOutsideClick);
      else if (!wrap.contains(e.target)) close();
    };
    document.addEventListener('click', onOutsideClick);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); toggle.focus(); } });
    logoutItem.addEventListener('click', () => { close(); logout(); });
    resetItem.addEventListener('click', () => { close(); resetData(); });
    return wrap;
  }

  // PC は左ナビ、スマホは上部バーと下部タブと右下の＋。登録・ログイン・404 では使わない
  function layout(content, { title }) {
    const user = RT.store.currentUser();
    const path = parseHash(location.hash).path;
    const items = navItems(user);

    const logoutBtn = el('button', { type: 'button', class: 'nav-link nav-button' },
      el('span', { class: 'nav-icon', 'aria-hidden': 'true', text: '⏻' }), el('span', { text: 'ログアウト' }));
    logoutBtn.addEventListener('click', logout);
    const resetBtn = el('button', { type: 'button', class: 'nav-link nav-button' },
      el('span', { class: 'nav-icon', 'aria-hidden': 'true', text: '↺' }), el('span', { text: '見本データに戻す' }));
    resetBtn.addEventListener('click', resetData);
    const postBtn = el('button', { type: 'button', class: 'btn btn-primary btn-block', text: '投稿する' });
    postBtn.addEventListener('click', () => RT.app.openComposer());
    const fab = el('button', { type: 'button', class: 'fab', 'aria-label': '投稿する', text: '＋' });
    fab.addEventListener('click', () => RT.app.openComposer());

    const sidenav = el('nav', { class: 'sidenav', 'aria-label': 'メイン' },
      el('a', { href: '#/', class: 'logo', text: 'raise-timeline' }),
      el('div', { class: 'nav-list' },
        ...items.map((i) => navLink(i, path, 'nav-link')),
        logoutBtn,
        resetBtn),
      postBtn,
      el('a', { class: 'me', href: items[2].href },
        avatar(user, 40),
        el('span', { class: 'me-text' },
          el('span', { class: 'me-name', text: user.displayName }),
          el('span', { class: 'me-username', text: '@' + user.username }))));

    const topbar = el('header', { class: 'topbar' },
      el('h1', { class: 'topbar-title', text: title }),
      menuButton());

    const tabbar = el('nav', { class: 'tabbar', 'aria-label': 'タブ' },
      ...items.map((i) => navLink(i, path, 'tab')));

    const main = el('main', { class: 'main' },
      el('div', { class: 'column' },
        el('h1', { class: 'column-title', text: title }),
        content));

    return el('div', { class: 'shell' }, sidenav, topbar, main, tabbar, fab);
  }

  function start() {
    RT.store.init();
    window.addEventListener('hashchange', route);
    route();
  }

  window.RT = window.RT || {};
  window.RT.app = { navigate, route, layout, isSafeNext, openComposer, start };

  start();
})();

// 画面をまたいで使う部品。DOM を返す関数と、待ち・通知・確認。
(function () {
  'use strict';

  const MIN = 60e3;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => {
      if (c != null) node.append(c);
    });
    return node;
  }

  function delay() {
    return new Promise((resolve) => setTimeout(resolve, 200));
  }

  function toast(message) {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = el('div', { id: 'toast-region', class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(region);
    }
    const node = el('div', { class: 'toast', text: message });
    region.append(node);
    setTimeout(() => node.remove(), 3500);
  }

  // 取り消しが既定（autofocus）。Esc と背景のクリックは取り消し。
  function confirm({ title, description, confirmLabel, cancelLabel }) {
    return new Promise((resolve) => {
      const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'confirm-title' },
        el('form', { method: 'dialog', class: 'dialog-body' },
          el('h2', { id: 'confirm-title', class: 'dialog-title', text: title }),
          description ? el('p', { class: 'dialog-text', text: description }) : null,
          el('div', { class: 'dialog-actions' },
            el('button', { type: 'submit', value: 'cancel', class: 'btn', autofocus: true, text: cancelLabel || 'キャンセル' }),
            el('button', { type: 'submit', value: 'ok', class: 'btn btn-primary', text: confirmLabel || 'OK' }))));
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close('cancel');
      });
      dialog.addEventListener('close', () => {
        resolve(dialog.returnValue === 'ok');
        dialog.remove();
      });
      (document.getElementById('dialogs') || document.body).append(dialog);
      dialog.showModal();
    });
  }

  // 画像が無ければ表示名の頭文字。色は id から決めて固定する。
  function avatar(user, size) {
    const px = size || 40;
    const src = user.avatarUrl || user.avatarDataUrl;
    const node = el('span', { class: 'avatar', 'aria-hidden': 'true' });
    node.style.width = node.style.height = px + 'px';
    if (src) {
      node.append(el('img', { src, alt: '' }));
    } else {
      node.style.background = `hsl(${(user.id * 47) % 360}, 45%, 40%)`;
      node.style.fontSize = Math.round(px * 0.45) + 'px';
      node.textContent = Array.from(user.displayName || '?')[0];
    }
    return node;
  }

  function spinner() {
    return el('span', { class: 'spinner', role: 'status', 'aria-label': '読み込み中' });
  }

  // 日本時間の年月日時分を取り出す
  function jstParts(date) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
    return { year: +parts.year, month: +parts.month, day: +parts.day, hour: parts.hour, minute: parts.minute };
  }

  function formatRelative(iso) {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    if (diff < MIN) return 'たった今';
    if (diff < HOUR) return `${Math.floor(diff / MIN)} 分前`;
    if (diff < DAY) return `${Math.floor(diff / HOUR)} 時間前`;
    const t = jstParts(date);
    const n = jstParts(new Date());
    return t.year === n.year ? `${t.month}月${t.day}日` : `${t.year}年${t.month}月${t.day}日`;
  }

  function formatAbsolute(iso) {
    const t = jstParts(new Date(iso));
    const pad = (v) => String(v).padStart(2, '0');
    return `${t.year}/${pad(t.month)}/${pad(t.day)} ${t.hour}:${t.minute}`;
  }

  // ラベル、入力欄、誤りの表示をひとまとめにする。el.input と el.setError を持つ。
  function textField({ id, label, type, value, error, autocomplete }) {
    const input = el('input', {
      id, type: type || 'text', name: id, autocomplete, class: 'input', value: value || '',
      'aria-describedby': id + '-error',
    });
    const message = el('p', { id: id + '-error', class: 'field-error' });
    const field = el('div', { class: 'field' }, el('label', { for: id, text: label }), input, message);
    field.input = input;
    field.setError = (text) => {
      message.textContent = text || '';
      if (text) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    };
    field.setError(error);
    return field;
  }

  // ---- 本文 ----
  // http:// と https:// で始まる URL だけをリンクにする。文字列と <a> の配列を返す（HTML は組み立てない）
  const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
  const URL_TRAILING_RE = /[.,;:!?)'\]]+$/;

  function linkify(text) {
    const nodes = [];
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      const url = m[0].replace(URL_TRAILING_RE, '');
      if (m.index > last) nodes.push(text.slice(last, m.index));
      nodes.push(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
      last = m.index + url.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
  }

  // ---- 画像 ----
  // 画像ビューア。<dialog> に重ねて表示する。背景か × か Esc で閉じ、複数枚は左右のボタンと矢印キーで移る
  function imageViewer(images, startIndex) {
    let index = startIndex || 0;
    const many = images.length > 1;
    const img = el('img', { class: 'viewer-img', alt: '' });
    const close = el('button', { type: 'button', class: 'viewer-btn viewer-close', 'aria-label': '閉じる', text: '×' });
    const prev = many ? el('button', { type: 'button', class: 'viewer-btn viewer-prev', 'aria-label': '前の画像', text: '‹' }) : null;
    const next = many ? el('button', { type: 'button', class: 'viewer-btn viewer-next', 'aria-label': '次の画像', text: '›' }) : null;
    const stage = el('div', { class: 'viewer-stage' }, img);
    const dialog = el('dialog', { class: 'viewer', 'aria-label': '画像' }, stage, close, prev, next);

    const show = (i) => {
      index = (i + images.length) % images.length;
      img.src = images[index].url;
      img.alt = many ? `画像 ${index + 1} / ${images.length}` : '画像';
    };
    show(index);

    close.addEventListener('click', () => dialog.close());
    if (many) {
      prev.addEventListener('click', () => show(index - 1));
      next.addEventListener('click', () => show(index + 1));
    }
    dialog.addEventListener('keydown', (e) => {
      if (!many) return;
      if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
    });
    // 画像とボタン以外（背景）を押したら閉じる
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target === stage) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove());

    (document.getElementById('dialogs') || document.body).append(dialog);
    dialog.showModal();
    return dialog;
  }

  // 1 枚は幅いっぱい、2 枚は横並び、3 枚は左 1 ＋右 2、4 枚は 2×2。押すとビューア
  function imageGrid(images) {
    const grid = el('div', { class: `image-grid image-grid-${images.length}` });
    images.forEach((image, i) => {
      const btn = el('button', { type: 'button', class: 'image-cell', 'aria-label': `画像 ${i + 1} を拡大` },
        el('img', { src: image.url, alt: `添付画像 ${i + 1}`, loading: 'lazy' }));
      btn.addEventListener('click', () => imageViewer(images, i));
      grid.append(btn);
    });
    return grid;
  }

  // ---- 無限スクロール一覧 ----
  // load(cursor) は { items, nextCursor } の Promise。items の各要素は id を持つ。
  // prepend(item) / remove(id) / update(item) で一覧を直接直せる。
  function infiniteList({ load, renderItem, emptyText }) {
    const itemsBox = el('div', { class: 'list-items' });
    const footer = el('div', { class: 'list-footer' });
    const sentinel = el('div', { class: 'list-sentinel', 'aria-hidden': 'true' });
    const root = el('div', { class: 'list' }, itemsBox, footer, sentinel);

    const nodes = new Map(); // id -> 描画した要素
    let cursor = null;
    let loading = false;
    let done = false;
    let failed = false;

    const observer = new IntersectionObserver((entries) => {
      if (!root.isConnected) return observer.disconnect();
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '200px' });

    function renderFooter() {
      footer.replaceChildren();
      if (loading) {
        footer.append(spinner());
      } else if (failed) {
        const retry = el('button', { type: 'button', class: 'btn', text: '再試行' });
        retry.addEventListener('click', loadMore);
        footer.append(el('p', { class: 'list-message', role: 'alert', text: '読み込みに失敗しました' }), retry);
      } else if (done) {
        footer.append(el('p', { class: 'list-message', text: nodes.size === 0 ? emptyText : 'これ以上ありません' }));
      }
    }

    // 末尾が見え続けていても次の通知が来るよう、監視をつけ直す
    function rewatch() {
      observer.unobserve(sentinel);
      observer.observe(sentinel);
    }

    async function loadMore() {
      if (loading || done) return;
      loading = true;
      failed = false;
      renderFooter();
      try {
        const page = await load(cursor);
        if (!root.isConnected) return observer.disconnect();
        page.items.forEach((item) => {
          if (nodes.has(item.id)) return; // 読み込み中に prepend された分
          const node = renderItem(item);
          nodes.set(item.id, node);
          itemsBox.append(node);
        });
        cursor = page.nextCursor;
        done = page.nextCursor == null;
        loading = false;
        renderFooter();
        if (!done) rewatch();
      } catch (err) {
        console.error(err);
        if (!root.isConnected) return observer.disconnect();
        loading = false;
        failed = true;
        renderFooter();
      }
    }

    observer.observe(sentinel);

    return Object.assign(root, {
      prepend(item) {
        if (nodes.has(item.id)) return;
        const node = renderItem(item);
        nodes.set(item.id, node);
        itemsBox.prepend(node);
        renderFooter();
      },
      remove(id) {
        const node = nodes.get(id);
        if (!node) return;
        node.remove();
        nodes.delete(id);
        renderFooter();
      },
      update(item) {
        const old = nodes.get(item.id);
        if (!old) return;
        const node = renderItem(item);
        old.replaceWith(node);
        nodes.set(item.id, node);
      },
    });
  }

  // ---- 本文の入力欄 ----
  // 入力欄、「残り n 文字」、誤りの表示。投稿フォームと編集ダイアログで使う。
  // field.textarea / field.count() / field.setError(text) / field.onInput(fn)
  function bodyField({ id, label, value }) {
    const max = RT.store.MAX_POST_CHARS;
    const textarea = el('textarea', {
      id, name: id, class: 'input textarea', rows: 3, 'aria-describedby': id + '-counter ' + id + '-error',
    });
    textarea.value = value || '';
    const counter = el('span', { id: id + '-counter', class: 'counter' });
    const message = el('p', { id: id + '-error', class: 'field-error' });
    const listeners = [];

    const count = () => RT.store.countCodePoints(textarea.value.replace(/\r\n?/g, '\n'));
    const refresh = () => {
      const remaining = max - count();
      counter.textContent = `残り ${remaining} 文字`;
      counter.classList.toggle('counter-over', remaining < 0);
    };
    textarea.addEventListener('input', () => {
      refresh();
      listeners.forEach((fn) => fn());
    });
    refresh();

    const field = el('div', { class: 'field body-field' },
      el('label', { for: id, class: 'sr-only', text: label }),
      textarea,
      el('div', { class: 'body-field-foot' }, message, counter));
    return Object.assign(field, {
      textarea,
      count,
      refresh,
      onInput(fn) { listeners.push(fn); },
      setError(text) {
        message.textContent = text || '';
        if (text) textarea.setAttribute('aria-invalid', 'true');
        else textarea.removeAttribute('aria-invalid');
      },
    });
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を開けませんでした'));
      img.src = src;
    });
  }

  // localStorage に収まるよう、保存の前に長辺 1280px へ縮める（小さい画像は拡大しない）。
  // JPEG と WebP は元の形式で品質 0.85、PNG は PNG、GIF は PNG にする（動きは失われる）。
  const MAX_SIDE = 1280;
  const OUTPUT_TYPE = { 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp', 'image/png': 'image/png', 'image/gif': 'image/png' };

  async function readImage(file) {
    const original = await readAsDataUrl(file);
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const shrunk = canvas.toDataURL(OUTPUT_TYPE[file.type], 0.85);
    // 縮める必要が無く、作り直すと大きくなるときは元のまま（GIF は PNG にするので除く）
    if (scale === 1 && file.type !== 'image/gif' && shrunk.length >= original.length) return original;
    return shrunk;
  }

  // 保存の失敗（localStorage の容量超過か、それ以外か）を、利用者に見せる文言にする
  function describeSaveError(err, fallback) {
    const quota = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
    return quota ? 'プロトタイプの保存容量を超えました。小さい画像を選ぶか、見本データに戻してください' : fallback;
  }

  // 投稿フォーム。成功したら onPosted(post) を呼んでフォームを空にする。form.focusBody() で入力欄へ
  function composeForm({ onPosted }) {
    const { MAX_IMAGES, MAX_IMAGE_BYTES } = RT.store;
    const uid = 'compose-' + Math.random().toString(36).slice(2, 8);
    const body = bodyField({ id: uid + '-body', label: '本文' });
    body.textarea.placeholder = '本文を入力';

    const images = []; // { dataUrl: 読み込み中は null }
    const imageMessage = el('p', { class: 'field-error', role: 'alert' });
    const previews = el('ul', { class: 'previews' });
    const fileInput = el('input', {
      type: 'file', class: 'sr-only', id: uid + '-file', tabindex: '-1',
      accept: 'image/jpeg,image/png,image/gif,image/webp', multiple: true,
    });
    const pick = el('button', { type: 'button', class: 'btn btn-small', text: '画像を追加' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary', text: '投稿する' });
    const form = el('form', { class: 'compose', novalidate: true }, body, previews, imageMessage,
      el('div', { class: 'compose-actions' }, pick, fileInput, submit));

    let touched = false; // 入力を始めたあとで空になったときだけ「本文か画像を入れてください」を出す
    let sending = false;

    function renderPreviews() {
      previews.replaceChildren(...images.map((image, i) => {
        const remove = el('button', { type: 'button', class: 'preview-remove', 'aria-label': `画像 ${i + 1} を取り消す`, text: '×' });
        remove.addEventListener('click', () => {
          images.splice(images.indexOf(image), 1);
          imageMessage.textContent = '';
          renderPreviews();
          refresh();
        });
        return el('li', { class: 'preview' },
          image.dataUrl ? el('img', { src: image.dataUrl, alt: `選んだ画像 ${i + 1}` }) : spinner(),
          remove);
      }));
      previews.hidden = images.length === 0;
    }

    function refresh() {
      const errors = RT.store.validatePostBody(body.textarea.value, images.length);
      const empty = body.count() === 0 && images.length === 0;
      const loadingImage = images.some((x) => !x.dataUrl);
      body.setError(empty && !touched ? '' : errors.body);
      submit.disabled = sending || loadingImage || Object.keys(errors).length > 0;
    }

    body.onInput(() => { touched = true; refresh(); });

    pick.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files);
      fileInput.value = '';
      imageMessage.textContent = '';
      const added = [];
      for (const file of files) {
        const problem = RT.store.validateImageFile(file, MAX_IMAGE_BYTES);
        if (problem) { imageMessage.textContent = problem; continue; }
        if (images.length >= MAX_IMAGES) { imageMessage.textContent = '画像は 4 枚までです'; break; }
        const entry = { dataUrl: null };
        images.push(entry);
        added.push([entry, file]);
      }
      renderPreviews();
      refresh();
      await Promise.all(added.map(async ([entry, file]) => {
        try {
          entry.dataUrl = await readImage(file);
        } catch (err) {
          console.error(err);
          images.splice(images.indexOf(entry), 1);
          imageMessage.textContent = '画像を読み込めませんでした。別のファイルを選んでください';
        }
      }));
      renderPreviews();
      refresh();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const errors = RT.store.validatePostBody(body.textarea.value, images.length);
      if (Object.keys(errors).length > 0) {
        body.setError(errors.body);
        imageMessage.textContent = errors.images || '';
        return;
      }
      sending = true;
      refresh();
      let posted = null;
      try {
        await delay();
        posted = RT.store.createPost({
          body: body.textarea.value,
          imageDataUrls: images.map((x) => x.dataUrl),
        });
        body.textarea.value = '';
        body.refresh();
        images.length = 0;
        touched = false;
        imageMessage.textContent = '';
        renderPreviews();
      } catch (err) {
        if (err instanceof RT.store.ValidationError) {
          body.setError(err.errors.body);
          imageMessage.textContent = err.errors.images || '';
        } else {
          console.error(err);
          toast(describeSaveError(err, '投稿に失敗しました。もう一度お試しください'));
        }
      } finally {
        sending = false;
        refresh();
      }
      if (posted) onPosted(posted);
    });

    renderPreviews();
    refresh();
    return Object.assign(form, { focusBody() { body.textarea.focus(); } });
  }

  // ---- 投稿カード ----
  // onChanged({ type: 'update' | 'delete', post })。absoluteTime は投稿詳細用
  function postCard(post, { onChanged, absoluteTime } = {}) {
    const me = RT.store.currentUser();
    const author = post.author;
    const profileHref = '#/users/' + encodeURIComponent(author.username);
    const detailHref = '#/posts/' + post.id;

    const time = el('time', {
      datetime: post.createdAt,
      title: absoluteTime ? false : formatAbsolute(post.createdAt),
      text: absoluteTime ? formatAbsolute(post.createdAt) : formatRelative(post.createdAt),
    });
    const head = el('div', { class: 'post-head' },
      el('a', { class: 'post-name', href: profileHref, text: author.displayName }),
      el('a', { class: 'post-username', href: profileHref, text: '@' + author.username }),
      el('span', { class: 'post-dot', 'aria-hidden': 'true', text: '·' }),
      el('a', { class: 'post-time', href: detailHref }, time),
      post.edited ? el('span', { class: 'post-edited', text: '編集済み' }) : null);

    const actions = el('div', { class: 'post-actions' },
      el('button', {
        type: 'button', class: 'like-btn', 'aria-pressed': String(post.likedByMe), 'aria-label': `いいね ${post.likeCount} 件`,
      }, el('span', { 'aria-hidden': 'true', text: post.likedByMe ? '♥' : '♡' }),
      el('span', { class: 'like-count', 'aria-hidden': 'true', text: String(post.likeCount) })),
      el('a', { class: 'comment-link', href: detailHref, 'aria-label': `コメント ${post.commentCount} 件` },
        el('span', { 'aria-hidden': 'true', text: '💬' }),
        el('span', { 'aria-hidden': 'true', text: String(post.commentCount) })));

    const content = el('div', { class: 'post-content' },
      head,
      post.body ? el('div', { class: 'post-body' }, linkify(post.body)) : null,
      post.images.length > 0 ? imageGrid(post.images) : null,
      actions);

    const card = el('article', { class: 'post-card', 'data-post-id': post.id },
      el('a', { href: profileHref, 'aria-hidden': 'true', tabindex: '-1' }, avatar(author, 44)),
      content);
    if (me && me.id === author.id) card.append(postMenu(post, onChanged));
    return card;
  }

  // 本人だけの「…」メニュー（編集／削除）
  function postMenu(post, onChanged) {
    const toggle = el('button', {
      type: 'button', class: 'icon-btn post-menu-btn', 'aria-label': 'この投稿の操作',
      'aria-haspopup': 'true', 'aria-expanded': 'false', text: '…',
    });
    const edit = el('button', { type: 'button', class: 'menu-item', text: '編集' });
    const del = el('button', { type: 'button', class: 'menu-item', text: '削除' });
    const menu = el('div', { class: 'menu', hidden: true }, edit, del);
    const wrap = el('div', { class: 'menu-wrap post-menu' }, toggle, menu);

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
    edit.addEventListener('click', () => { close(); RT.views.editPostDialog(post, onChanged); });
    del.addEventListener('click', () => { close(); RT.views.deletePost(post, onChanged); });
    return wrap;
  }

  window.RT = window.RT || {};
  window.RT.ui = {
    el, delay, toast, confirm, describeSaveError, readImage, avatar, spinner, formatRelative, formatAbsolute, textField,
    linkify, imageGrid, imageViewer, infiniteList, bodyField, composeForm, postCard,
  };
})();

// 画面ごとの描画関数。ctx は { path, params, query }。{ title, el } を返す。
(function () {
  'use strict';

  const { el, textField, delay } = RT.ui;

  function focusFirstError(fields) {
    const first = fields.find((f) => f.input.getAttribute('aria-invalid'));
    if (first) first.input.focus();
  }

  function authFrame(title, ...children) {
    return el('div', { class: 'auth' },
      el('div', { class: 'auth-card' },
        el('p', { class: 'auth-logo', text: 'raise-timeline' }),
        el('h1', { class: 'auth-title', text: title }),
        ...children));
  }

  function register() {
    const fields = {
      username: textField({ id: 'username', label: 'ユーザー名', autocomplete: 'username' }),
      displayName: textField({ id: 'displayName', label: '表示名', autocomplete: 'nickname' }),
      email: textField({ id: 'email', label: 'メールアドレス', type: 'email', autocomplete: 'email' }),
      password: textField({ id: 'password', label: 'パスワード', type: 'password', autocomplete: 'new-password' }),
    };
    const list = Object.values(fields);
    const submit = el('button', { type: 'submit', class: 'btn btn-primary btn-block', text: '登録する' });
    const form = el('form', { class: 'form', novalidate: true }, ...list, submit);

    const values = () => ({
      username: fields.username.input.value,
      displayName: fields.displayName.input.value,
      email: fields.email.input.value,
      password: fields.password.input.value,
    });
    const showErrors = (errors) => {
      Object.entries(fields).forEach(([name, f]) => f.setError(errors[name]));
      focusFirstError(list);
    };

    Object.entries(fields).forEach(([name, f]) => {
      f.input.addEventListener('input', () => f.setError(''));
      // 入力を終えた時点でその項目だけ検査する
      f.input.addEventListener('change', () => f.setError(RT.store.validateRegister(values())[name]));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const errors = RT.store.validateRegister(values());
      if (Object.keys(errors).length > 0) return showErrors(errors);

      submit.disabled = true;
      await delay();
      try {
        RT.store.register(values());
        RT.app.navigate('#/');
      } catch (err) {
        if (!(err instanceof RT.store.ConflictError)) throw err;
        const byField = {};
        err.errors.forEach((x) => { byField[x.field] = x.message; });
        showErrors(byField);
        submit.disabled = false;
      }
    });

    return {
      title: 'アカウント登録',
      el: authFrame('アカウント登録', form,
        el('p', { class: 'auth-link' }, el('a', { href: '#/login', text: 'ログインはこちら' }))),
    };
  }

  function login(ctx) {
    const fields = {
      email: textField({ id: 'email', label: 'メールアドレス', type: 'email', autocomplete: 'email' }),
      password: textField({ id: 'password', label: 'パスワード', type: 'password', autocomplete: 'current-password' }),
    };
    const list = Object.values(fields);
    const alert = el('p', { class: 'form-alert', role: 'alert' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'ログイン' });
    const form = el('form', { class: 'form', novalidate: true }, alert, ...list, submit);

    list.forEach((f) => f.input.addEventListener('input', () => f.setError('')));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      alert.textContent = '';
      const values = { email: fields.email.input.value, password: fields.password.input.value };
      const errors = RT.store.validateLogin(values);
      Object.entries(fields).forEach(([name, f]) => f.setError(errors[name]));
      if (Object.keys(errors).length > 0) return focusFirstError(list);

      submit.disabled = true;
      await delay();
      try {
        RT.store.login(values.email, values.password);
        RT.app.navigate(RT.app.isSafeNext(ctx.query.next) ? '#' + ctx.query.next : '#/');
      } catch (err) {
        if (!(err instanceof RT.store.AuthError)) throw err;
        alert.textContent = err.message;
        submit.disabled = false;
      }
    });

    return {
      title: 'ログイン',
      el: authFrame('ログイン', form,
        el('p', { class: 'auth-link' }, el('a', { href: '#/register', text: 'アカウントを作る' }))),
    };
  }

  function notFound() {
    return {
      title: 'ページが見つかりません',
      el: authFrame('ページが見つかりません',
        el('p', { class: 'auth-text', text: 'お探しのページは存在しないか、移動した可能性があります。' }),
        el('p', { class: 'auth-link' }, el('a', { href: '#/', text: 'ホームへ戻る' }))),
    };
  }

  // ---- ホーム ----
  const TABS = [
    { key: 'following', label: 'フォロー中', empty: 'まだ投稿がありません。「すべて」から気になる人をフォローしてみましょう' },
    { key: 'all', label: 'すべて', empty: 'まだ投稿がありません' },
  ];

  function home(ctx) {
    const tab = TABS.find((t) => t.key === ctx.query.tab) || TABS[0];

    const onChanged = ({ type, post }) => {
      if (type === 'delete') list.remove(post.id);
      else list.update(post);
    };
    const list = RT.ui.infiniteList({
      load: async (cursor) => {
        await delay();
        return RT.store.timeline(tab.key, cursor);
      },
      renderItem: (post) => RT.ui.postCard(post, { onChanged }),
      emptyText: tab.empty,
    });
    const compose = RT.ui.composeForm({ onPosted: (post) => list.prepend(post) });

    const tabs = el('nav', { class: 'timeline-tabs', 'aria-label': 'タイムラインの種類' },
      ...TABS.map((t) => el('a', {
        class: 'timeline-tab', href: `#/?tab=${t.key}`, 'aria-current': t === tab ? 'page' : false, text: t.label,
      })));

    return {
      title: 'ホーム',
      el: el('div', { class: 'home' }, el('div', { class: 'home-compose' }, compose), tabs, list),
    };
  }

  // ---- 投稿詳細 ----
  // id が不正か投稿が無ければ null（呼び出し側が 404 の画面にする）
  function findPostOrNull(id) {
    if (!/^\d+$/.test(id)) return null;
    try {
      return RT.store.getPost(id);
    } catch (err) {
      if (err instanceof RT.store.NotFoundError) return null;
      throw err;
    }
  }

  // コメントフォーム。送信に成功したら onPosted(comment)、投稿が消えていたら onGone()
  function commentForm({ postId, onPosted, onGone }) {
    const field = RT.ui.bodyField({ id: 'comment-body', label: 'コメント' });
    field.textarea.placeholder = 'コメントを入力';
    const submit = el('button', { type: 'submit', class: 'btn btn-primary', text: 'コメントする' });
    const form = el('form', { class: 'comment-form', novalidate: true }, field,
      el('div', { class: 'comment-form-actions' }, submit));

    let touched = false; // 入力を始めたあとで空になったときだけ誤りを出す
    let sending = false;
    const refresh = () => {
      const errors = RT.store.validateComment(field.textarea.value);
      const empty = field.count() === 0;
      field.setError(empty && !touched ? '' : errors.body);
      submit.disabled = sending || Boolean(errors.body);
    };
    field.onInput(() => { touched = true; refresh(); });
    refresh();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      sending = true;
      refresh();
      let posted = null;
      try {
        await delay();
        posted = RT.store.addComment(postId, field.textarea.value);
        field.textarea.value = '';
        field.refresh();
        touched = false;
      } catch (err) {
        if (err instanceof RT.store.ValidationError) {
          field.setError(err.errors.body);
        } else if (err instanceof RT.store.NotFoundError) {
          RT.ui.toast('投稿が見つかりません');
          onGone();
        } else {
          console.error(err);
          RT.ui.toast(RT.ui.describeSaveError(err, 'コメントに失敗しました。もう一度お試しください'));
        }
      } finally {
        sending = false;
        refresh();
      }
      if (posted) onPosted(posted);
    });
    return form;
  }

  // 投稿カードの下にコメントフォームと一覧を並べる。currentCard().setCommentCount で数を合わせる
  function commentSection(post, currentCard) {
    let count = post.commentCount;
    const deleting = new Set();

    const onDelete = async (comment) => {
      if (deleting.has(comment.id)) return;
      const ok = await RT.ui.confirm({
        title: 'このコメントを削除しますか？',
        confirmLabel: '削除',
        cancelLabel: '取り消し',
      });
      if (!ok) return;
      deleting.add(comment.id);
      try {
        await delay();
        RT.store.deleteComment(comment.id);
        list.remove(comment.id);
        currentCard().setCommentCount(--count);
        RT.ui.toast('コメントを削除しました');
      } catch (err) {
        if (err instanceof RT.store.NotFoundError) {
          RT.ui.toast('コメントが見つかりません');
          list.remove(comment.id);
        } else if (err instanceof RT.store.ForbiddenError) {
          RT.ui.toast('この操作はできません');
        } else {
          console.error(err);
          RT.ui.toast('削除に失敗しました。もう一度お試しください');
        }
      } finally {
        deleting.delete(comment.id);
      }
    };

    const list = RT.ui.infiniteList({
      load: async (cursor) => {
        await delay();
        try {
          return RT.store.comments(post.id, cursor);
        } catch (err) {
          if (!(err instanceof RT.store.NotFoundError)) throw err;
          RT.app.route(); // 投稿が消えている。404 の画面にする
          return { items: [], nextCursor: null };
        }
      },
      renderItem: (comment) => RT.ui.commentItem(comment, { onDelete }),
      emptyText: 'まだコメントがありません',
    });
    const form = commentForm({
      postId: post.id,
      onPosted: (comment) => {
        list.prepend(comment);
        currentCard().setCommentCount(++count);
      },
      onGone: () => RT.app.route(),
    });
    return el('section', { class: 'comments', 'aria-label': 'コメント' }, form, list);
  }

  function postDetail(ctx) {
    const id = ctx.params.id;
    // 無い id は 404 の画面にする
    if (!findPostOrNull(id)) return notFound();

    const box = el('div', { class: 'post-detail' }, el('div', { class: 'list-footer' }, RT.ui.spinner()));
    let card = null;
    const render = (post) => {
      card = RT.ui.postCard(post, {
        absoluteTime: true,
        showLikersLink: true,
        onChanged: ({ type, post: changed }) => {
          if (type === 'delete') RT.app.navigate('#/');
          else render(changed);
        },
      });
      // 編集のあとで描き直すときも、コメントの一覧は読み直さずに残す
      const section = box.querySelector('.comments');
      if (section) {
        box.firstElementChild.replaceWith(card);
      } else {
        box.replaceChildren(card, commentSection(post, () => card));
      }
    };

    (async () => {
      await delay();
      if (!box.isConnected) return;
      try {
        render(RT.store.getPost(id));
      } catch (err) {
        if (!(err instanceof RT.store.NotFoundError)) throw err;
        RT.app.route();
      }
    })();

    return { title: '投稿', el: box };
  }

  // ---- いいねした人 ----
  function likers(ctx) {
    const id = ctx.params.id;
    if (!findPostOrNull(id)) return notFound();

    const list = RT.ui.infiniteList({
      load: async (cursor) => {
        await delay();
        try {
          return RT.store.likers(id, cursor);
        } catch (err) {
          if (!(err instanceof RT.store.NotFoundError)) throw err;
          RT.app.route(); // 投稿が消えている。404 の画面にする
          return { items: [], nextCursor: null };
        }
      },
      renderItem: (user) => RT.ui.userCard(user),
      emptyText: 'まだいいねがありません',
    });
    return { title: 'いいねした人', el: list };
  }

  // ---- 投稿の編集と削除 ----
  // 本文だけ直せる。画像は表示するだけ。onChanged({ type: 'update', post })
  function editPostDialog(post, onChanged) {
    const field = RT.ui.bodyField({ id: 'edit-body', label: '本文', value: post.body });
    const cancel = el('button', { type: 'button', class: 'btn', text: '取り消し' });
    const save = el('button', { type: 'submit', class: 'btn btn-primary', text: '保存' });
    const form = el('form', { class: 'dialog-body', novalidate: true },
      el('h2', { id: 'edit-title', class: 'dialog-title', text: '投稿を編集' }),
      field,
      post.images.length > 0
        ? el('ul', { class: 'previews' }, post.images.map((image, i) =>
          el('li', { class: 'preview' }, el('img', { src: image.url, alt: `添付画像 ${i + 1}` }))))
        : null,
      el('div', { class: 'dialog-actions' }, cancel, save));
    const dialog = el('dialog', { class: 'dialog dialog-wide', 'aria-labelledby': 'edit-title' }, form);

    let sending = false;
    const refresh = () => {
      const errors = RT.store.validatePostBody(field.textarea.value, post.images.length);
      field.setError(errors.body);
      save.disabled = sending || Object.keys(errors).length > 0;
    };
    field.onInput(refresh);
    refresh();

    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (save.disabled) return;
      sending = true;
      refresh();
      let updated = null;
      try {
        await delay();
        updated = RT.store.updatePost(post.id, field.textarea.value);
      } catch (err) {
        if (err instanceof RT.store.ValidationError) {
          field.setError(err.errors.body);
        } else if (err instanceof RT.store.NotFoundError) {
          RT.ui.toast('投稿が見つかりません');
          dialog.close();
          RT.app.route();
        } else if (err instanceof RT.store.ForbiddenError) {
          RT.ui.toast('この操作はできません');
        } else {
          console.error(err);
          RT.ui.toast(RT.ui.describeSaveError(err, '保存に失敗しました。もう一度お試しください'));
        }
      } finally {
        sending = false;
        if (dialog.isConnected) refresh();
      }
      if (updated) {
        dialog.close();
        onChanged({ type: 'update', post: updated });
      }
    });

    document.getElementById('dialogs').append(dialog);
    dialog.showModal();
    field.textarea.focus();
    return dialog;
  }

  async function deletePost(post, onChanged) {
    const ok = await RT.ui.confirm({
      title: 'この投稿を削除しますか？',
      description: 'いいねとコメントも消えます',
      confirmLabel: '削除',
      cancelLabel: '取り消し',
    });
    if (!ok) return;
    try {
      await delay();
      RT.store.deletePost(post.id);
    } catch (err) {
      if (err instanceof RT.store.NotFoundError) {
        RT.ui.toast('投稿が見つかりません');
        RT.app.route();
      } else if (err instanceof RT.store.ForbiddenError) {
        RT.ui.toast('この操作はできません');
      } else {
        console.error(err);
        RT.ui.toast('削除に失敗しました。もう一度お試しください');
      }
      return;
    }
    RT.ui.toast('投稿を削除しました');
    onChanged({ type: 'delete', post });
  }

  window.RT = window.RT || {};
  window.RT.views = { register, login, notFound, home, postDetail, likers, editPostDialog, deletePost };
})();

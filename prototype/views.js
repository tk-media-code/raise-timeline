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

  // ---- 投稿詳細（コメントは Task 3） ----
  function postDetail(ctx) {
    const id = ctx.params.id;
    // 無い id は 404 の画面にする
    if (!/^\d+$/.test(id)) return notFound();
    try {
      RT.store.getPost(id);
    } catch (err) {
      if (err instanceof RT.store.NotFoundError) return notFound();
      throw err;
    }

    const box = el('div', { class: 'post-detail' }, el('div', { class: 'list-footer' }, RT.ui.spinner()));
    const render = (post) => {
      const card = RT.ui.postCard(post, {
        absoluteTime: true,
        onChanged: ({ type, post: changed }) => {
          if (type === 'delete') RT.app.navigate('#/');
          else render(changed);
        },
      });
      box.replaceChildren(card);
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
  window.RT.views = { register, login, notFound, home, postDetail, editPostDialog, deletePost };
})();

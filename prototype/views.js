// 画面ごとの描画関数。ctx は { path, params, query }。{ title, el } を返す。
(function () {
  'use strict';

  const { el, textField, delay } = RT.ui;

  // アイコンは小さく縮めて保存する（投稿の画像は ui.js の既定 1280px）
  const AVATAR_MAX_SIDE = 400;

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

  // 存在しない投稿・ユーザー（docs/error-handling-design.md 4 章の 404「見つかりません」の画面）。
  // ログイン中に開くので、レイアウト（ナビ）の中に出す。見出しはレイアウトが title から出す
  function notFoundResource() {
    return {
      title: '見つかりません',
      el: el('div', { class: 'not-found' },
        el('p', { class: 'auth-text', text: 'お探しの投稿やユーザーは見つかりませんでした' }),
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
    // 無い id は「見つかりません」の画面にする
    if (!findPostOrNull(id)) return notFoundResource();

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
    if (!findPostOrNull(id)) return notFoundResource();

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

  // ---- プロフィール ----
  // ユーザー名の人が居なければ null（呼び出し側が 404 の画面にする）
  function findUserOrNull(username) {
    try {
      return RT.store.getUser(username);
    } catch (err) {
      if (err instanceof RT.store.NotFoundError) return null;
      throw err;
    }
  }

  function userHref(username, suffix) {
    return '#/users/' + encodeURIComponent(username) + (suffix || '');
  }

  // アイコン、名前、自己紹介、登録月、数、ボタン。フォローを押すとフォロワー数だけ差し替える
  function profileHeader(user) {
    const followersCount = el('strong', { text: String(user.followersCount) });
    const others = user.followersCount - (user.isFollowing ? 1 : 0); // 自分以外のフォロワー数
    const action = user.isMe
      ? el('a', { class: 'btn', href: '#/settings/profile', text: 'プロフィールを編集' })
      : RT.ui.followButton(user, {
        onChanged: ({ isFollowing }) => { followersCount.textContent = String(others + (isFollowing ? 1 : 0)); },
      });

    return el('section', { class: 'profile-head', 'aria-label': 'プロフィール' },
      el('div', { class: 'profile-head-top' },
        RT.ui.avatar(user, 80),
        el('div', { class: 'profile-action' }, action)),
      el('h2', { class: 'profile-name', text: user.displayName }),
      el('p', { class: 'profile-username', text: '@' + user.username }),
      user.bio ? el('p', { class: 'profile-bio', text: user.bio }) : null,
      el('p', { class: 'profile-joined', text: RT.ui.formatJoined(user.createdAt) }),
      el('p', { class: 'profile-counts' },
        el('a', { href: userHref(user.username, '/following') }, 'フォロー中 ', el('strong', { text: String(user.followingCount) })),
        el('a', { href: userHref(user.username, '/followers') }, 'フォロワー ', followersCount)));
  }

  function profilePosts(user) {
    const onChanged = ({ type, post }) => {
      if (type === 'delete') list.remove(post.id);
      else list.update(post);
    };
    const list = RT.ui.infiniteList({
      load: async (cursor) => {
        await delay();
        try {
          return RT.store.userPosts(user.username, cursor);
        } catch (err) {
          if (!(err instanceof RT.store.NotFoundError)) throw err;
          RT.app.route(); // 人が消えている。404 の画面にする
          return { items: [], nextCursor: null };
        }
      },
      renderItem: (post) => RT.ui.postCard(post, { onChanged }),
      emptyText: 'まだ投稿がありません',
    });
    return list;
  }

  function profile(ctx) {
    const first = findUserOrNull(ctx.params.username);
    if (!first) return notFoundResource();

    const box = el('div', { class: 'profile' }, el('div', { class: 'list-footer' }, RT.ui.spinner()));
    (async () => {
      await delay();
      if (!box.isConnected) return;
      const user = findUserOrNull(ctx.params.username);
      if (!user) return RT.app.route();
      box.replaceChildren(profileHeader(user), profilePosts(user));
    })();

    return { title: first.displayName, el: box };
  }

  // ---- フォロワー・フォロー中 ----
  // kind は 'followers' か 'following'。上部のタブで 2 つの一覧を行き来する
  function followList(kind, ctx) {
    const user = findUserOrNull(ctx.params.username);
    if (!user) return notFoundResource();

    const tabs = [
      { key: 'followers', label: 'フォロワー', empty: 'フォロワーはいません' },
      { key: 'following', label: 'フォロー中', empty: '誰もフォローしていません' },
    ];
    const current = tabs.find((t) => t.key === kind);
    const nav = el('nav', { class: 'timeline-tabs', 'aria-label': 'フォロワーとフォロー中' },
      ...tabs.map((t) => el('a', {
        class: 'timeline-tab', href: userHref(user.username, '/' + t.key), 'aria-current': t === current ? 'page' : false, text: t.label,
      })));

    const list = RT.ui.infiniteList({
      load: async (cursor) => {
        await delay();
        try {
          return RT.store[kind](user.username, cursor);
        } catch (err) {
          if (!(err instanceof RT.store.NotFoundError)) throw err;
          RT.app.route(); // 人が消えている。404 の画面にする
          return { items: [], nextCursor: null };
        }
      },
      renderItem: (item) => RT.ui.userCard(item),
      emptyText: current.empty,
    });
    return { title: user.displayName, el: el('div', { class: 'follow-list' }, nav, list) };
  }

  function followers(ctx) { return followList('followers', ctx); }
  function following(ctx) { return followList('following', ctx); }

  // ---- プロフィール編集 ----
  function profileEditForm(user) {
    const { validateProfile, MAX_BIO, MAX_AVATAR_BYTES } = RT.store;

    // アイコン。選んだ時点で縮めて保存し、プレビューを差し替える（「保存」とは別の要求）
    const preview = el('div', { class: 'avatar-preview' }, RT.ui.avatar(user, 80));
    const avatarMessage = el('p', { class: 'field-error', role: 'alert' });
    const fileInput = el('input', {
      type: 'file', class: 'sr-only', id: 'profile-avatar', tabindex: '-1', 'aria-label': 'アイコンの画像',
      accept: 'image/jpeg,image/png,image/gif,image/webp',
    });
    const pick = el('button', { type: 'button', class: 'btn btn-small', text: '画像を変更' });
    const avatarField = el('div', { class: 'field', role: 'group', 'aria-labelledby': 'profile-avatar-caption' },
      el('p', { id: 'profile-avatar-caption', class: 'field-caption', text: 'アイコン' }),
      el('div', { class: 'avatar-edit' }, preview, el('div', { class: 'avatar-edit-side' }, pick, fileInput, avatarMessage)));

    const nameField = textField({ id: 'displayName', label: '表示名', value: user.displayName, autocomplete: 'nickname' });
    const bioField = RT.ui.bodyField({ id: 'bio', label: '自己紹介', value: user.bio, max: MAX_BIO, showLabel: true });
    const usernameField = textField({ id: 'profile-username', label: 'ユーザー名', value: user.username });
    const emailField = textField({ id: 'profile-email', label: 'メールアドレス', type: 'email', value: user.email });
    usernameField.input.disabled = true;
    emailField.input.disabled = true;

    const save = el('button', { type: 'submit', class: 'btn btn-primary', text: '保存' });
    const form = el('form', { class: 'form profile-form', novalidate: true },
      avatarField, nameField, bioField, usernameField, emailField,
      el('div', { class: 'form-actions' }, save));

    const values = () => ({ displayName: nameField.input.value, bio: bioField.textarea.value });
    let sending = false;
    let avatarBusy = false;
    const refresh = () => {
      const errors = validateProfile(values());
      nameField.setError(errors.displayName);
      bioField.setError(errors.bio);
      save.disabled = sending || avatarBusy || Object.keys(errors).length > 0;
    };
    nameField.input.addEventListener('input', refresh);
    bioField.onInput(refresh);
    refresh();

    pick.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      avatarMessage.textContent = '';
      const problem = RT.store.validateImageFile(file, MAX_AVATAR_BYTES);
      if (problem) {
        avatarMessage.textContent = problem;
        return;
      }
      avatarBusy = true;
      pick.disabled = true;
      refresh();
      try {
        const dataUrl = await RT.ui.readImage(file, { maxSide: AVATAR_MAX_SIDE }).catch((err) => {
          console.error(err);
          avatarMessage.textContent = '画像を読み込めませんでした。別のファイルを選んでください';
          return null;
        });
        if (!dataUrl) return;
        await delay();
        RT.store.updateAvatar(dataUrl);
        preview.replaceChildren(RT.ui.avatar({ ...user, avatarUrl: dataUrl }, 80));
      } catch (err) {
        console.error(err);
        RT.ui.toast(RT.ui.describeSaveError(err, '画像の変更に失敗しました。もう一度お試しください'));
      } finally {
        avatarBusy = false;
        pick.disabled = false;
        refresh();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (save.disabled) return;
      sending = true;
      refresh();
      let saved = false;
      try {
        await delay();
        RT.store.updateProfile(values());
        saved = true;
      } catch (err) {
        if (err instanceof RT.store.ValidationError) {
          nameField.setError(err.errors.displayName);
          bioField.setError(err.errors.bio);
        } else {
          console.error(err);
          RT.ui.toast(RT.ui.describeSaveError(err, '保存に失敗しました。もう一度お試しください'));
        }
      } finally {
        sending = false;
        refresh();
      }
      if (saved) {
        RT.ui.toast('保存しました');
        RT.app.navigate(userHref(user.username));
      }
    });
    return form;
  }

  // ---- 退会 ----
  const DELETE_ACCOUNT_WARNING = '退会すると、投稿・コメント・いいね・フォロー・画像がすべて消え、元に戻せません。';

  // 退会の確認。ui.confirm と同じ作りで、パスワード欄が付く。取り消しが既定。Esc と背景のクリックは取り消し。
  // 成功したらダイアログを閉じて onDeleted() を呼ぶ
  function deleteAccountDialog(onDeleted) {
    const field = textField({ id: 'delete-password', label: 'パスワード', type: 'password', autocomplete: 'current-password' });
    const cancel = el('button', { type: 'button', class: 'btn', autofocus: true, text: '取り消し' });
    const submit = el('button', { type: 'submit', class: 'btn btn-danger', text: '退会する' });
    const form = el('form', { class: 'dialog-body', novalidate: true },
      el('h2', { id: 'delete-account-title', class: 'dialog-title', text: '本当に退会しますか？' }),
      el('p', { class: 'dialog-text', text: DELETE_ACCOUNT_WARNING }),
      field,
      el('div', { class: 'dialog-actions' }, cancel, submit));
    const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'delete-account-title' }, form);

    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove());
    field.input.addEventListener('input', () => field.setError(''));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const password = field.input.value;
      if (!password) {
        field.setError('入力してください');
        field.input.focus();
        return;
      }
      submit.disabled = true;
      let done = false;
      try {
        await delay();
        RT.store.deleteAccount(password);
        done = true;
      } catch (err) {
        if (err instanceof RT.store.AuthError) {
          field.setError(err.message);
          field.input.focus();
        } else {
          console.error(err);
          RT.ui.toast(RT.ui.describeSaveError(err, '退会に失敗しました。もう一度お試しください'));
        }
      } finally {
        submit.disabled = false;
      }
      if (done) {
        dialog.close();
        onDeleted();
      }
    });

    document.getElementById('dialogs').append(dialog);
    dialog.showModal();
    return dialog;
  }

  // プロフィール編集の最後の区画。押すと確認ダイアログが開く
  function deleteAccountSection() {
    const button = el('button', { type: 'button', class: 'btn btn-danger', text: '退会する' });
    button.addEventListener('click', () => {
      deleteAccountDialog(() => {
        RT.ui.toast('退会しました');
        RT.app.navigate('#/login');
      });
    });
    return el('section', { class: 'danger-zone', 'aria-labelledby': 'danger-zone-title' },
      el('h2', { id: 'danger-zone-title', class: 'danger-zone-title', text: '退会' }),
      el('p', { class: 'danger-zone-text', text: DELETE_ACCOUNT_WARNING }),
      button);
  }

  function profileEdit() {
    const box = el('div', { class: 'profile-edit' }, el('div', { class: 'list-footer' }, RT.ui.spinner()));
    (async () => {
      await delay();
      if (!box.isConnected) return;
      box.replaceChildren(profileEditForm(RT.store.me()), deleteAccountSection());
    })();
    return { title: 'プロフィールを編集', el: box };
  }

  // ---- 検索 ----
  // 入力が 400 ms 止まったら自動で検索し、Enter なら即時に検索する（検索ボタンは無い）。
  // 検索語は #/search?q= に持たせるが、入力のたびに履歴を積まないよう replaceState で書き換える
  // （replaceState は hashchange を起こさないので、この画面が自分で結果を描き直す）。
  // 開いたときにハッシュに q があれば、すぐに検索する
  const SEARCH_DEBOUNCE_MS = 400;

  function search(ctx) {
    const initial = ctx.query.q == null ? '' : ctx.query.q;

    const input = el('input', {
      id: 'search-q', type: 'search', name: 'q', class: 'input', value: initial, autocomplete: 'off',
      'aria-label': 'ユーザー名か表示名', placeholder: 'ユーザー名か表示名で探す', 'aria-describedby': 'search-q-error',
    });
    const message = el('p', { id: 'search-q-error', class: 'field-error', role: 'alert' });
    const form = el('form', { class: 'search-form', role: 'search', novalidate: true }, input);
    const results = el('div', { class: 'search-results' });
    const root = el('div', { class: 'search' }, form, message, results);

    let timer = null;
    let seq = 0; // 新しい検索が始まるたびに増やす。古い検索の結果は捨てる

    function writeHash(text) {
      try {
        history.replaceState(null, '', text ? '#/search?q=' + encodeURIComponent(text) : '#/search');
      } catch (err) {
        console.error(err); // file:// の一部のブラウザなど。URL が変わらないだけで検索はできる
      }
    }

    function run(raw, { reflect }) {
      clearTimeout(timer);
      timer = null;
      const mine = ++seq;
      const text = raw.trim();
      if (reflect) writeHash(text);

      message.textContent = '';
      input.removeAttribute('aria-invalid');
      results.replaceChildren();

      if (!text) {
        results.append(el('p', { class: 'placeholder', text: 'ユーザー名か表示名で探せます' }));
        return;
      }
      if (RT.store.validateSearchQuery(text)) {
        message.textContent = '50 文字以内で入力してください';
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      results.append(RT.ui.infiniteList({
        load: async (cursor) => {
          await delay();
          if (mine !== seq) return { items: [], nextCursor: null };
          return RT.store.searchUsers(text, cursor);
        },
        renderItem: (user) => RT.ui.userCard(user),
        emptyText: '該当するユーザーがいません',
      }));
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (root.isConnected) run(input.value, { reflect: true });
      }, SEARCH_DEBOUNCE_MS);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(input.value, { reflect: true });
    });

    run(initial, { reflect: false });
    return { title: '検索', el: root };
  }

  window.RT = window.RT || {};
  window.RT.views = {
    register, login, notFound, notFoundResource, home, postDetail, likers, editPostDialog, deletePost,
    profile, followers, following, profileEdit, search,
  };
})();

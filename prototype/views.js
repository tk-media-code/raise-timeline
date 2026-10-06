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

  // Task 2 で本物に置き換える
  function home() {
    return {
      title: 'ホーム',
      el: el('p', { class: 'placeholder', text: 'タイムラインは Task 2 で作る' }),
    };
  }

  window.RT = window.RT || {};
  window.RT.views = { register, login, notFound, home };
})();

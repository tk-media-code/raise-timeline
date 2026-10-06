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
  function confirm({ title, description, confirmLabel }) {
    return new Promise((resolve) => {
      const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'confirm-title' },
        el('form', { method: 'dialog', class: 'dialog-body' },
          el('h2', { id: 'confirm-title', class: 'dialog-title', text: title }),
          description ? el('p', { class: 'dialog-text', text: description }) : null,
          el('div', { class: 'dialog-actions' },
            el('button', { type: 'submit', value: 'cancel', class: 'btn', autofocus: true, text: 'キャンセル' }),
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

  window.RT = window.RT || {};
  window.RT.ui = { el, delay, toast, confirm, avatar, spinner, formatRelative, formatAbsolute, textField };
})();

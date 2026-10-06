// データと API の代わりの関数。すべて同期。画面側が RT.ui.delay() で待ってから呼ぶ。
(function () {
  'use strict';

  const DATA_KEY = 'rt.data';
  const SESSION_KEY = 'rt.session';

  // ---- エラー ----
  class AuthError extends Error {
    constructor(message) { super(message); this.name = 'AuthError'; }
  }
  class ValidationError extends Error {
    // errors: { 項目名: 文言 }
    constructor(errors) { super('入力に誤りがあります'); this.name = 'ValidationError'; this.errors = errors; }
  }
  class ConflictError extends Error {
    // errors: [{ field, message }]
    constructor(errors) { super(errors[0].message); this.name = 'ConflictError'; this.errors = errors; }
  }
  class ForbiddenError extends Error {
    constructor(message) { super(message || 'この操作はできません'); this.name = 'ForbiddenError'; }
  }
  class NotFoundError extends Error {
    constructor(message) { super(message || '見つかりません'); this.name = 'NotFoundError'; }
  }

  // ---- 保存 ----
  function load() { return JSON.parse(localStorage.getItem(DATA_KEY)); }
  function save(data) { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
  function newId(data) { return data.nextId++; }

  function countCodePoints(text) { return Array.from(text).length; }

  // ---- 検証 ----
  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
  const PASSWORD_RE = /^[\x21-\x7E]{8,72}$/;

  function validateRegister(values) {
    const errors = {};
    if (!USERNAME_RE.test(values.username || '')) {
      errors.username = '3〜20 文字の英数字と _ で入力してください';
    }
    const n = countCodePoints((values.displayName || '').trim());
    if (n < 1 || n > 50) {
      errors.displayName = '1〜50 文字で入力してください';
    }
    const email = values.email || '';
    if (!EMAIL_RE.test(email) || email.length > 254) {
      errors.email = 'メールアドレスの形式で入力してください';
    }
    if (!PASSWORD_RE.test(values.password || '')) {
      errors.password = '8〜72 文字の半角英数字と記号で入力してください';
    }
    return errors;
  }

  function validateLogin(values) {
    const errors = {};
    if (!(values.email || '').trim()) errors.email = 'メールアドレスを入力してください';
    if (!values.password) errors.password = 'パスワードを入力してください';
    return errors;
  }

  // ---- 認証 ----
  function publicUser(u) {
    if (!u) return null;
    const { password, ...rest } = u;
    return rest;
  }

  function currentUser() {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!session) return null;
    return publicUser(load().users.find((u) => u.id === session.userId));
  }

  function setSession(userId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
  }

  function login(email, password) {
    const key = (email || '').trim().toLowerCase();
    const user = load().users.find((u) => u.email.toLowerCase() === key);
    if (!user || user.password !== password) {
      throw new AuthError('メールアドレスまたはパスワードが違います');
    }
    setSession(user.id);
    return publicUser(user);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function register(values) {
    const errors = validateRegister(values);
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    const data = load();
    const conflicts = [];
    if (data.users.some((u) => u.username.toLowerCase() === values.username.toLowerCase())) {
      conflicts.push({ field: 'username', message: 'このユーザー名は使われています' });
    }
    if (data.users.some((u) => u.email.toLowerCase() === values.email.toLowerCase())) {
      conflicts.push({ field: 'email', message: 'このメールアドレスは登録済みです' });
    }
    if (conflicts.length > 0) throw new ConflictError(conflicts);

    const user = {
      id: newId(data),
      username: values.username,
      displayName: values.displayName.trim(),
      email: values.email,
      password: values.password,
      bio: '',
      avatarDataUrl: null,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    save(data);
    setSession(user.id);
    return publicUser(user);
  }

  // ---- 投稿 ----
  const PAGE_SIZE = 20;
  const MAX_POST_CHARS = 280;
  const MAX_IMAGES = 4;
  const MAX_IMAGE_BYTES = 5242880;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  // multipart と同じく、CRLF を LF に直してから数える
  function normalizeBody(body) {
    return String(body == null ? '' : body).replace(/\r\n?/g, '\n');
  }

  // 戻り値は { body?, images? }。誤りが無ければ空
  function validatePostBody(body, imageCount) {
    const errors = {};
    const n = countCodePoints(normalizeBody(body));
    if (n > MAX_POST_CHARS) errors.body = '280 文字以内で入力してください';
    else if (n === 0 && !imageCount) errors.body = '本文か画像を入れてください';
    if (imageCount > MAX_IMAGES) errors.images = '画像は 4 枚までです';
    return errors;
  }

  // 戻り値は誤りの文言。通れば null
  function validateImageFile(file, maxBytes) {
    if (!IMAGE_TYPES.includes(file.type)) return 'JPEG、PNG、GIF、WebP の画像を選んでください';
    if (file.size === 0) return '空のファイルは選べません';
    const max = maxBytes || MAX_IMAGE_BYTES;
    if (file.size > max) return `画像は ${Math.floor(max / 1048576)} MB 以内にしてください`;
    return null;
  }

  function authorOf(data, userId) {
    const u = data.users.find((x) => x.id === userId);
    return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarDataUrl };
  }

  // 保存形式の投稿を、画面に渡す Post の形にする（docs/api-conventions.md 3 章）
  function toPost(data, row, meId) {
    const likes = data.likes.filter((l) => l.postId === row.id);
    return {
      id: row.id,
      author: authorOf(data, row.userId),
      body: row.body,
      images: data.postImages
        .filter((i) => i.postId === row.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ id: i.id, url: i.dataUrl })),
      likeCount: likes.length,
      commentCount: data.comments.filter((c) => c.postId === row.id).length,
      likedByMe: likes.some((l) => l.userId === meId),
      edited: Date.parse(row.updatedAt) > Date.parse(row.createdAt),
      createdAt: row.createdAt,
    };
  }

  // 新しい順（id の降順）。カーソルは最後に受け取った id。21 件取って次があるか決める
  function pagePosts(data, rows, cursor, meId) {
    const sorted = rows
      .filter((p) => cursor == null || p.id < cursor)
      .sort((a, b) => b.id - a.id)
      .slice(0, PAGE_SIZE + 1);
    const items = sorted.slice(0, PAGE_SIZE).map((p) => toPost(data, p, meId));
    return { items, nextCursor: sorted.length > PAGE_SIZE ? items[items.length - 1].id : null };
  }

  function requireUser() {
    const user = currentUser();
    if (!user) throw new AuthError('ログインが必要です');
    return user;
  }

  function timeline(tab, cursor) {
    const me = requireUser();
    const data = load();
    let rows = data.posts;
    if (tab === 'following') {
      const ids = new Set([me.id, ...data.follows.filter((f) => f.followerId === me.id).map((f) => f.followeeId)]);
      rows = rows.filter((p) => ids.has(p.userId));
    }
    return pagePosts(data, rows, cursor, me.id);
  }

  function userPosts(username, cursor) {
    const me = requireUser();
    const data = load();
    const user = data.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user) throw new NotFoundError();
    return pagePosts(data, data.posts.filter((p) => p.userId === user.id), cursor, me.id);
  }

  function findPost(data, id) {
    const row = data.posts.find((p) => p.id === Number(id));
    if (!row) throw new NotFoundError();
    return row;
  }

  function getPost(id) {
    const me = requireUser();
    const data = load();
    return toPost(data, findPost(data, id), me.id);
  }

  function createPost({ body, imageDataUrls }) {
    const me = requireUser();
    const text = normalizeBody(body);
    const urls = imageDataUrls || [];
    const errors = validatePostBody(text, urls.length);
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    const data = load();
    const now = new Date().toISOString();
    const row = { id: newId(data), userId: me.id, body: text, createdAt: now, updatedAt: now };
    data.posts.push(row);
    urls.forEach((dataUrl, position) => {
      data.postImages.push({ id: newId(data), postId: row.id, dataUrl, position });
    });
    save(data);
    return toPost(data, row, me.id);
  }

  function updatePost(id, body) {
    const me = requireUser();
    const data = load();
    const row = findPost(data, id);
    if (row.userId !== me.id) throw new ForbiddenError();
    const text = normalizeBody(body);
    const imageCount = data.postImages.filter((i) => i.postId === row.id).length;
    const errors = validatePostBody(text, imageCount);
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    row.body = text;
    row.updatedAt = new Date(Math.max(Date.now(), Date.parse(row.createdAt) + 1)).toISOString();
    save(data);
    return toPost(data, row, me.id);
  }

  function deletePost(id) {
    const me = requireUser();
    const data = load();
    const row = findPost(data, id);
    if (row.userId !== me.id) throw new ForbiddenError();
    data.posts = data.posts.filter((p) => p.id !== row.id);
    data.postImages = data.postImages.filter((i) => i.postId !== row.id);
    data.likes = data.likes.filter((l) => l.postId !== row.id);
    data.comments = data.comments.filter((c) => c.postId !== row.id);
    save(data);
  }

  // ---- いいね ----
  // 付ける・外すはどちらも、既にその状態でも成功する（2 回押しても 1 件）
  function like(postId) {
    const me = requireUser();
    const data = load();
    const post = findPost(data, postId);
    if (!data.likes.some((l) => l.postId === post.id && l.userId === me.id)) {
      data.likes.push({ id: newId(data), postId: post.id, userId: me.id, createdAt: new Date().toISOString() });
      save(data);
    }
  }

  function unlike(postId) {
    const me = requireUser();
    const data = load();
    const post = findPost(data, postId);
    const rest = data.likes.filter((l) => !(l.postId === post.id && l.userId === me.id));
    if (rest.length !== data.likes.length) {
      data.likes = rest;
      save(data);
    }
  }

  // UserCard の形（docs/api-conventions.md 3 章）
  function toUserCard(data, user, meId) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarDataUrl,
      bio: user.bio,
      isFollowing: data.follows.some((f) => f.followerId === meId && f.followeeId === user.id),
    };
  }

  // 並びとカーソルは likes の id（項目の id は利用者の id）
  function likers(postId, cursor) {
    const me = requireUser();
    const data = load();
    const post = findPost(data, postId);
    const rows = data.likes
      .filter((l) => l.postId === post.id && (cursor == null || l.id < cursor))
      .sort((a, b) => b.id - a.id)
      .slice(0, PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map((l) => toUserCard(data, data.users.find((u) => u.id === l.userId), me.id)),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    };
  }

  // ---- コメント ----
  // 戻り値は { body? }。誤りが無ければ空。空白だけも誤り
  function validateComment(body) {
    const text = normalizeBody(body);
    const n = countCodePoints(text);
    return n < 1 || n > MAX_POST_CHARS || text.trim() === '' ? { body: '1〜280 文字で入力してください' } : {};
  }

  // Comment の形（docs/api-conventions.md 3 章）
  function toComment(data, row) {
    return { id: row.id, author: authorOf(data, row.userId), body: row.body, createdAt: row.createdAt };
  }

  function comments(postId, cursor) {
    requireUser();
    const data = load();
    const post = findPost(data, postId);
    const rows = data.comments
      .filter((c) => c.postId === post.id && (cursor == null || c.id < cursor))
      .sort((a, b) => b.id - a.id)
      .slice(0, PAGE_SIZE + 1);
    const items = rows.slice(0, PAGE_SIZE).map((c) => toComment(data, c));
    return { items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null };
  }

  function addComment(postId, body) {
    const me = requireUser();
    const data = load();
    const post = findPost(data, postId);
    const errors = validateComment(body);
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    const row = { id: newId(data), postId: post.id, userId: me.id, body: normalizeBody(body), createdAt: new Date().toISOString() };
    data.comments.push(row);
    save(data);
    return toComment(data, row);
  }

  // 投稿の持ち主でも、他人のコメントは消せない
  function deleteComment(id) {
    const me = requireUser();
    const data = load();
    const row = data.comments.find((c) => c.id === Number(id));
    if (!row) throw new NotFoundError();
    if (row.userId !== me.id) throw new ForbiddenError();
    data.comments = data.comments.filter((c) => c.id !== row.id);
    save(data);
  }

  // ---- プロフィール ----
  const MAX_DISPLAY_NAME = 50;
  const MAX_BIO = 160;
  const MAX_AVATAR_BYTES = 2097152;
  const MAX_SEARCH_CHARS = 50;

  // 戻り値は { displayName?, bio? }。誤りが無ければ空。表示名は前後の空白を除いて数え、自己紹介は CRLF を LF に直して数える
  function validateProfile(values) {
    const errors = {};
    const nameLength = countCodePoints(String(values.displayName == null ? '' : values.displayName).trim());
    if (nameLength < 1 || nameLength > MAX_DISPLAY_NAME) errors.displayName = '1〜50 文字で入力してください';
    if (countCodePoints(normalizeBody(values.bio)) > MAX_BIO) errors.bio = '160 文字以内で入力してください';
    return errors;
  }

  function findUserByName(data, username) {
    const key = String(username).toLowerCase();
    const user = data.users.find((u) => u.username.toLowerCase() === key);
    if (!user) throw new NotFoundError();
    return user;
  }

  // UserDetail の形（docs/api-conventions.md 3 章）
  function toUserDetail(data, user, meId) {
    return {
      ...toUserCard(data, user, meId),
      followersCount: data.follows.filter((f) => f.followeeId === user.id).length,
      followingCount: data.follows.filter((f) => f.followerId === user.id).length,
      createdAt: user.createdAt,
      isMe: user.id === meId,
    };
  }

  function getUser(username) {
    const me = requireUser();
    const data = load();
    return toUserDetail(data, findUserByName(data, username), me.id);
  }

  // 自分の UserDetail に email を足した形
  function me() {
    const user = requireUser();
    const data = load();
    const row = data.users.find((u) => u.id === user.id);
    return { ...toUserDetail(data, row, row.id), email: row.email };
  }

  function updateProfile({ displayName, bio }) {
    const user = requireUser();
    const errors = validateProfile({ displayName, bio });
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    const data = load();
    const row = data.users.find((u) => u.id === user.id);
    row.displayName = displayName.trim();
    row.bio = normalizeBody(bio);
    save(data);
    return me();
  }

  // 画像の形式と大きさの検査は画面側（validateImageFile）で済ませてから呼ぶ
  function updateAvatar(dataUrl) {
    const user = requireUser();
    const data = load();
    data.users.find((u) => u.id === user.id).avatarDataUrl = dataUrl;
    save(data);
    return { avatarUrl: dataUrl };
  }

  // ---- フォロー ----
  // どちらも既にその状態でも成功する（2 回押しても 1 行）
  function follow(username) {
    const user = requireUser();
    const data = load();
    const target = findUserByName(data, username);
    if (target.id === user.id) throw new ValidationError({ username: '自分自身はフォローできません' });
    if (!data.follows.some((f) => f.followerId === user.id && f.followeeId === target.id)) {
      data.follows.push({ id: newId(data), followerId: user.id, followeeId: target.id, createdAt: new Date().toISOString() });
      save(data);
    }
  }

  function unfollow(username) {
    const user = requireUser();
    const data = load();
    const target = findUserByName(data, username);
    const rest = data.follows.filter((f) => !(f.followerId === user.id && f.followeeId === target.id));
    if (rest.length !== data.follows.length) {
      data.follows = rest;
      save(data);
    }
  }

  // 並びとカーソルは follows の id（項目の id は利用者の id）。otherSide は一覧に出す側の列名
  function pageFollows(data, rows, cursor, otherSide, meId) {
    const sorted = rows
      .filter((f) => cursor == null || f.id < cursor)
      .sort((a, b) => b.id - a.id)
      .slice(0, PAGE_SIZE + 1);
    const page = sorted.slice(0, PAGE_SIZE);
    return {
      items: page.map((f) => toUserCard(data, data.users.find((u) => u.id === f[otherSide]), meId)),
      nextCursor: sorted.length > PAGE_SIZE ? page[page.length - 1].id : null,
    };
  }

  function followers(username, cursor) {
    const user = requireUser();
    const data = load();
    const target = findUserByName(data, username);
    return pageFollows(data, data.follows.filter((f) => f.followeeId === target.id), cursor, 'followerId', user.id);
  }

  function following(username, cursor) {
    const user = requireUser();
    const data = load();
    const target = findUserByName(data, username);
    return pageFollows(data, data.follows.filter((f) => f.followerId === target.id), cursor, 'followeeId', user.id);
  }

  // ---- ユーザー検索 ----
  // 戻り値は誤りの文言。通れば null。前後の空白を除いてから 1〜50 文字
  function validateSearchQuery(q) {
    const n = countCodePoints(String(q == null ? '' : q).trim());
    if (n < 1) return '検索する語を入力してください';
    if (n > MAX_SEARCH_CHARS) return '50 文字以内で入力してください';
    return null;
  }

  // ユーザー名か表示名に q を含む人。大文字小文字は区別せず、正規表現は使わない（% _ . もそのままの文字）
  function searchUsers(q, cursor) {
    const user = requireUser();
    const problem = validateSearchQuery(q);
    if (problem) throw new ValidationError({ q: problem });

    const data = load();
    const key = String(q).trim().toLowerCase();
    const sorted = data.users
      .filter((u) => (cursor == null || u.id < cursor)
        && (u.username.toLowerCase().includes(key) || u.displayName.toLowerCase().includes(key)))
      .sort((a, b) => b.id - a.id)
      .slice(0, PAGE_SIZE + 1);
    const page = sorted.slice(0, PAGE_SIZE);
    return {
      items: page.map((u) => toUserCard(data, u, user.id)),
      nextCursor: sorted.length > PAGE_SIZE ? page[page.length - 1].id : null,
    };
  }

  // ---- 見本データ ----
  function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function avatarSvg(bg, fg, shape) {
    const mark = shape === 'circle'
      ? `<circle cx="64" cy="64" r="36" fill="${fg}"/>`
      : `<rect x="30" y="30" width="68" height="68" rx="8" fill="${fg}"/>`;
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="${bg}"/>${mark}</svg>`);
  }

  const IMAGE_COLORS = [
    ['#cfe8fc', '#0f6fb3'], ['#fde2cf', '#d9692b'], ['#d9f2dc', '#2f8f4a'], ['#ecdcf7', '#7b4bb0'],
  ];

  function postImageSvg(n) {
    const [bg, fg] = IMAGE_COLORS[n % IMAGE_COLORS.length];
    const mark = n % 2 === 0
      ? `<circle cx="320" cy="200" r="90" fill="${fg}"/>`
      : `<polygon points="320,100 420,290 220,290" fill="${fg}"/>`;
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="${bg}"/>${mark}<text x="24" y="376" font-size="28" fill="${fg}" font-family="sans-serif">見本画像 ${n + 1}</text></svg>`);
  }

  const MAIN_USERS = [
    ['alice', 'アリス', 'ソフトウェアエンジニア。朝のコーヒーと散歩が日課です。', null],
    ['bob', 'ボブ', '写真と自転車が好きです。週末はだいたい外にいます。', null],
    ['carol', 'キャロル', '料理と読書。おすすめの本があれば教えてください。', null],
    ['dave', 'デイブ', '音楽をつくっています。ギターは下手の横好きです。', null],
    ['erika', 'エリカ', 'デザイナー。色と形のことばかり考えています。', avatarSvg('#e8a33d', '#ffffff', 'circle')],
    ['frank', 'フランク', '登山と温泉。山の上で食べるおにぎりが最高です。', avatarSvg('#3d8fe8', '#ffffff', 'square')],
  ];

  // [フォローする人, フォローされる人]
  const FOLLOW_PAIRS = [
    ['alice', 'bob'], ['alice', 'carol'], ['alice', 'erika'],
    ['bob', 'alice'], ['bob', 'dave'],
    ['carol', 'alice'],
    ['dave', 'frank'],
    ['erika', 'alice'], ['erika', 'bob'], ['erika', 'carol'],
  ];

  const AUTHOR_CYCLE = ['alice', 'bob', 'alice', 'carol', 'alice', 'dave', 'erika', 'alice', 'frank', 'alice'];

  const POST_OPENERS = [
    '朝のコーヒーを淹れた。', '電車の中で本を読み終えた。', '近所の公園で桜が咲いていた。', '新しいキーボードが届いた。',
    '久しぶりに友人と会った。', '昼ごはんにカレーを作った。', '雨の音を聞きながら作業している。', '今日は早めに仕事が片づいた。',
    '散歩の途中で猫に会った。', '夜空がきれいだった。',
  ];
  const POST_ENDINGS = [
    '今日も一日がんばろう。', 'また行きたい。', '思ったよりよかった。', '少し疲れたけれど満足。', 'みんなはどうしてる？', '明日が楽しみ。',
  ];
  const COMMENT_TEXTS = [
    'いいですね！', 'わかります、私もそう思います。', '参考になりました。', 'ありがとうございます。', 'それは楽しそう。',
    '今度ぜひ教えてください。', 'お疲れさまです。', 'すてきな一日ですね。', '写真も見てみたいです。', 'なるほど、試してみます。',
    'うらやましいです。', '続きが気になります。',
  ];

  // 「たった今」「n 分前」「n 時間前」「昨日」「先月」「去年」の各帯に散らす（古い順。ミリ秒前）
  const MIN = 60e3;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const POST_AGES = [
    ...[600, 560, 520, 480, 450, 420].map((d) => d * DAY),
    ...[90, 80, 70, 60, 50, 45, 40, 35].map((d) => d * DAY),
    ...[29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3].map((d) => d * DAY),
    ...[47, 44, 41, 38, 35, 32, 29, 27, 26, 25].map((h) => h * HOUR),
    ...[23, 20, 17, 14, 11, 9, 8, 7, 6, 5, 4, 3].map((h) => h * HOUR),
    2 * HOUR, 45 * MIN, 20 * MIN, 10 * MIN, 6 * MIN, 3 * MIN,
    90e3, 50e3, 30e3, 10e3,
  ];

  const MANY_INDEX = 30; // いいね 24 人とコメント 25 件を付ける投稿（alice の投稿）
  const EDITED_INDEXES = [20, 45];

  function padTo(text, length) {
    const filler = Array.from('あいうえおかきくけこ');
    const chars = Array.from(text);
    for (let i = 0; chars.length < length; i++) chars.push(filler[i % filler.length]);
    return chars.join('');
  }

  function postBody(i) {
    if (i === 14) {
      // 改行 10 個を含む 280 文字ちょうど
      const lines = [];
      for (let k = 0; k < 10; k++) lines.push(padTo(`行${k + 1}：`, 24));
      lines.push(padTo('最後の行：', 30));
      return lines.join('\n');
    }
    if (i === 37) return padTo(POST_OPENERS[7] + POST_ENDINGS[3], 280);
    const sep = i % 7 === 3 ? '\n' : '';
    let body = POST_OPENERS[i % 10] + sep + POST_ENDINGS[Math.floor(i / 10)];
    if (i % 9 === 4) body += `\nhttps://example.com/articles/${i + 1}`;
    return body;
  }

  function seed() {
    const now = Date.now();
    const iso = (ms) => new Date(Math.min(ms, now - 1000)).toISOString();
    let s = 20261006; // 毎回同じ並びになる疑似乱数
    const rand = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const data = { users: [], posts: [], postImages: [], likes: [], comments: [], follows: [], nextId: 1 };
    const add = (list, row) => { row.id = data.nextId++; list.push(row); return row; };

    const userCreated = iso(now - 700 * DAY); // 最古の投稿（600 日前）より前
    const idByName = {};
    MAIN_USERS.forEach(([username, displayName, bio, avatar]) => {
      const u = add(data.users, {
        username, displayName, email: `${username}@example.com`, password: 'password1',
        bio, avatarDataUrl: avatar, createdAt: userCreated,
      });
      idByName[username] = u.id;
    });
    const extraIds = [];
    for (let n = 7; n <= 30; n++) {
      const u = add(data.users, {
        username: `user${String(n).padStart(2, '0')}`, displayName: `見本ユーザー ${n}`,
        email: `user${String(n).padStart(2, '0')}@example.com`, password: 'password1',
        bio: '', avatarDataUrl: null, createdAt: userCreated,
      });
      extraIds.push(u.id);
    }
    const mainIds = MAIN_USERS.map(([username]) => idByName[username]);

    FOLLOW_PAIRS.forEach(([a, b]) => {
      add(data.follows, { followerId: idByName[a], followeeId: idByName[b], createdAt: iso(now - 30 * DAY) });
    });

    let imageNo = 0;
    POST_AGES.forEach((age, i) => {
      const createdMs = now - age;
      const edited = EDITED_INDEXES.includes(i);
      const post = add(data.posts, {
        userId: idByName[AUTHOR_CYCLE[i % 10]],
        body: postBody(i),
        createdAt: iso(createdMs),
        updatedAt: iso(edited ? createdMs + 20 * MIN : createdMs),
      });

      if (i % 5 === 2) {
        const count = (Math.floor(i / 5) % 4) + 1;
        for (let p = 0; p < count; p++) {
          add(data.postImages, { postId: post.id, dataUrl: postImageSvg(imageNo++), position: p });
        }
      }

      const likers = i === MANY_INDEX ? extraIds : shuffled(mainIds, rand).slice(0, Math.floor(rand() * 6));
      likers.forEach((userId, k) => {
        add(data.likes, { postId: post.id, userId, createdAt: iso(createdMs + (k + 1) * 2 * MIN) });
      });

      const commentCount = i === MANY_INDEX ? 25 : Math.floor(rand() * 4);
      for (let k = 0; k < commentCount; k++) {
        add(data.comments, {
          postId: post.id,
          userId: mainIds[(i + k) % mainIds.length],
          body: COMMENT_TEXTS[(i + k) % COMMENT_TEXTS.length],
          createdAt: iso(createdMs + (k + 1) * 3 * MIN),
        });
      }
    });

    save(data);
    return data;
  }

  function shuffled(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function init() {
    if (!localStorage.getItem(DATA_KEY)) seed();
  }

  function reset() {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(SESSION_KEY);
    seed();
  }

  window.RT = window.RT || {};
  window.RT.store = {
    AuthError, ValidationError, ConflictError, ForbiddenError, NotFoundError,
    MAX_POST_CHARS, MAX_IMAGES, MAX_IMAGE_BYTES,
    load, save, newId,
    init, reset, seed,
    currentUser, login, logout, register,
    validateRegister, validateLogin, validatePostBody, validateComment, validateImageFile, countCodePoints,
    timeline, userPosts, getPost, createPost, updatePost, deletePost,
    like, unlike, likers, comments, addComment, deleteComment,
    MAX_BIO, MAX_AVATAR_BYTES,
    validateProfile, validateSearchQuery, getUser, me, updateProfile, updateAvatar,
    follow, unfollow, followers, following, searchUsers,
  };
})();

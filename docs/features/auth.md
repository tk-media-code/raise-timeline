# 登録・ログイン・ログアウト

- 日付: 2026-10-06
- 要件: [requirements.md](../requirements.md) の 3.1
- 設計: [auth-design.md](../auth-design.md)、[error-handling-design.md](../error-handling-design.md)
- Issue: 実装の順序の 1「認証の基盤を作る」

## 1. 概要

利用者がアカウントを作り、ログインし、ログアウトする。ログインの持続はアクセストークンとリフレッシュトークンで行う。
この Issue は認証の基盤でもあり、`users` と `refresh_tokens` のテーブル、エラー処理の共通部分、`/api/health` への移動、
Vite の proxy、フロントの API クライアント・認証状態・共通レイアウトも一緒に作る。

## 2. 画面

### 登録 `/register`

| 項目 | 入力 | 検証（画面とサーバーで同じ） | 誤りの文言 |
| --- | --- | --- | --- |
| ユーザー名 | テキスト | 3〜20 文字。英数字と `_` だけ | 3〜20 文字の英数字と _ で入力してください |
| 表示名 | テキスト | 1〜50 文字（空白だけは不可） | 1〜50 文字で入力してください |
| メールアドレス | email | メールアドレスの形式。254 文字以内 | メールアドレスの形式で入力してください |
| パスワード | password | 8〜72 文字。半角英数字と記号 | 8〜72 文字の半角英数字と記号で入力してください |

- ボタン「登録する」。送信中は無効
- リンク「ログインはこちら」→ `/login`
- 成功したらログイン済みとして `/` へ移る
- 409 は該当する項目の下に「このユーザー名は使われています」「このメールアドレスは登録済みです」

### ログイン `/login`

| 項目 | 入力 |
| --- | --- |
| メールアドレス | email |
| パスワード | password |

- ボタン「ログイン」。送信中は無効
- リンク「アカウントを作る」→ `/register`
- 失敗はフォーム上部に「メールアドレスまたはパスワードが違います」。どちらが違うかは言わない
- 成功したら `?next=` があればそこへ、無ければ `/` へ
- ログイン済みで開いたら `/` へ移す

### ログアウト

左ナビ（PC）または上部バーのメニュー（スマホ）の「ログアウト」→ 確認ダイアログ → `POST /api/auth/logout` → 状態を捨てて `/login` へ。

## 3. API

### `POST /api/auth/register`

```json
{ "username": "alice", "displayName": "アリス", "email": "alice@example.com", "password": "correct-horse-1" }
```

| 応答 | 場面 |
| --- | --- |
| 201 `{ "accessToken": "...", "user": UserDetail }` ＋ `Set-Cookie: refresh_token=...` | 成功 |
| 409 `USERNAME_TAKEN` / `EMAIL_TAKEN` | 重複。`errors` に項目 |
| 422 `VALIDATION_ERROR` | 検証の失敗 |

### `POST /api/auth/login`

```json
{ "email": "alice@example.com", "password": "correct-horse-1" }
```

| 応答 | 場面 |
| --- | --- |
| 200 `{ "accessToken": "...", "user": UserDetail }` ＋ Cookie | 成功 |
| 401 `INVALID_CREDENTIALS` | メールアドレスが無い、またはパスワードが違う |
| 422 | 項目が空 |

### `POST /api/auth/refresh`

入力は Cookie だけ。

| 応答 | 場面 |
| --- | --- |
| 200 `{ "accessToken": "...", "user": UserDetail }` ＋ 新しい Cookie | 有効なリフレッシュトークン |
| 401 `INVALID_REFRESH_TOKEN` ＋ Cookie を消す | 無い、期限切れ、ログアウト済み、使用済み |

### `POST /api/auth/logout`

入力は Cookie だけ。常に 204 で、Cookie を消す。該当する `refresh_tokens` の行を消す。

### `GET /api/health`

今の `GET /` を移す。応答は変えない。

## 4. 処理の流れ

[auth-design.md](../auth-design.md) の 3 章。

## 5. データ

`V1__users.sql` で `users` と `refresh_tokens` を作る（[database-design.md](../database-design.md)）。

## 6. テストの期待一覧

### 正常系

- 正しい入力で登録すると 201。応答に `accessToken` と `user`（`isMe` が true）が入り、`refresh_token` の Cookie が付く
- 登録したメールアドレスとパスワードでログインすると 200
- ログインで返った Cookie で更新を呼ぶと 200。新しい `accessToken` と新しい Cookie が返る
- 更新のあと、古いリフレッシュトークンで更新を呼ぶと 401（使い捨て）
- ログアウトのあと更新を呼ぶと 401
- `accessToken` を付けて `GET /api/users/me` を呼ぶと 200
- 応答の `user` にパスワードのハッシュが含まれない。DB のハッシュは `$2` で始まる（BCrypt）
- `GET /api/health` が 200 を返す（移動後も同じ応答）

### 入力の境界

- ユーザー名: 2 文字は 422、3 文字は通る、20 文字は通る、21 文字は 422。ハイフンや日本語を含むと 422
- 表示名: 空白だけは 422、1 文字は通る、50 文字は通る、51 文字は 422。絵文字 1 つは 1 文字と数える
- メールアドレス: `@` が無いと 422。255 文字は 422
- パスワード: 7 文字は 422、8 文字は通る、72 文字は通る、73 文字は 422。全角文字を含むと 422
- ログインで項目が空だと 422

### 権限

- トークン無しで `GET /api/users/me` は 401 `UNAUTHENTICATED`
- 期限切れのトークンは 401
- 署名が違うトークンは 401
- 画面: 未ログインで `/` を開くと `/login?next=/` へ移り、ログイン後に `/` へ戻る
- 画面: ログイン済みで `/login` を開くと `/` へ移る

### 異常系

- DB に届かないとき、ログインは 500 で、本文に原因が無い
- 画面: API が 401 を返したら、更新を 1 回だけ呼び、成功なら元の要求をやり直す。更新も 401 なら `/login` へ移る
- 画面: 同時に複数の要求が 401 になっても、更新は 1 回しか呼ばれない

### 重複と一意性

- 同じユーザー名で 2 回登録すると 409 `USERNAME_TAKEN`。`errors` に `username`。`Alice` と `alice` も重複
- 同じメールアドレスで 2 回登録すると 409 `EMAIL_TAKEN`。大文字小文字が違っても重複

### 並び順とページング

この機能には無い。

### その他

- ログイン失敗の文言は、存在しないメールアドレスでも、パスワード違いでも同じ
- ログの出力にパスワードとトークンが含まれない

## 7. 手動確認の手順

1. `docker compose up -d --build` で起動し、`http://localhost:5173/register` で登録する → `/` に移る
2. リロードしても ログイン状態が続く（起動時の更新が通る）
3. ログアウト → `/login` に移り、`/` を開くと `/login?next=/` に戻される
4. ログイン → `/` に戻る
5. ブラウザの開発者ツールで、Cookie に `refresh_token`（HttpOnly）があり、localStorage に何も無いことを見る
6. 同じユーザー名で再登録すると、項目の下に重複の文言が出る
7. `http://localhost:8080/api/health` が 200 を返す

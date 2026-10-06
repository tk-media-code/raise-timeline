# API 共通規約

- 日付: 2026-10-06

機能ごとの入出力の詳細は `features/` の各文書にある。ここは全 API に共通する決めごとと、エンドポイントの一覧。

## 1. 共通規約

| 項目 | 規約 |
| --- | --- |
| 置き場所 | すべて `/api` 配下。本文は JSON（UTF-8）。画像のアップロードだけ multipart/form-data |
| 認証 | `Authorization: Bearer <アクセストークン>`。例外は登録・ログイン・更新・ログアウト・ヘルスチェック（[auth-design.md](auth-design.md)） |
| 名前 | URL は複数形の名詞をケバブケースで（`/api/posts`）。JSON のキーは camelCase |
| ID | UUID の文字列（例 `0199c1f0-7b2a-7c3d-8e4f-123456789abc`） |
| 日時 | ISO 8601 の UTC、秒まで（例 `2026-10-06T05:12:34Z`）。日本時間への変換は画面で行う |
| 文字数 | Unicode のコードポイント数で数える。サーバーは `String.codePointCount`、画面は `Array.from(text).length` |
| 作成 | 201 と作ったものの本文 |
| 取得・更新 | 200 と本文 |
| 削除、いいね、フォロー | 204 で本文なし。いいねとフォローは何度呼んでも同じ結果（既に済みでも 204）。外す側も同じ |
| エラー | Problem Details（[error-handling-design.md](error-handling-design.md)） |
| キャッシュ | API の応答は `Cache-Control: no-store` |
| リクエスト ID | 応答ヘッダー `X-Request-Id`。エラー本文の `requestId` と同じ値 |

## 2. 一覧（カーソル方式）

| | 内容 |
| --- | --- |
| 要求 | `?cursor=<最後に受け取った項目の id>&limit=20`。`cursor` を省くと先頭から。`limit` は 1〜50、省くと 20 |
| 応答 | `{ "items": [...], "nextCursor": "<id>" }`。続きが無ければ `"nextCursor": null` |
| 並び | 新しい順（id の降順）。すべての一覧で同じ |
| 不正な値 | `cursor` が UUID でない、`limit` が範囲外 → 400 |

サーバーは `limit + 1` 件を取り、余分な 1 件があれば `nextCursor` に `limit` 件目の id を入れる。

```json
{
  "items": [ { "id": "0199c1f0-...", "...": "..." } ],
  "nextCursor": "0199c1a0-..."
}
```

ページ番号ではなくカーソルにする理由は、読み込んでいる間に新しい投稿が増えてもページの区切りがずれず、重複も抜けも起きないため。

## 3. 応答の形

| 名前 | 中身 | 使う場面 |
| --- | --- | --- |
| UserSummary | id, username, displayName, avatarUrl | 投稿とコメントの `author` |
| UserCard | UserSummary ＋ bio, isFollowing | 一覧（検索、フォロワー、フォロー中、いいねした人） |
| UserDetail | UserCard ＋ followersCount, followingCount, postsCount, createdAt, isMe | プロフィール、ログイン中の自分 |
| Post | id, author（UserSummary）, body, images（`[{ id, url }]`）, likeCount, commentCount, likedByMe, edited, createdAt | タイムライン、投稿詳細、その人の投稿 |
| Comment | id, author（UserSummary）, body, createdAt | コメント一覧 |

- `avatarUrl` はアイコン未設定なら `null`。画面は表示名の頭文字を出す
- `isFollowing` は「ログイン中の利用者がその人をフォローしているか」。自分自身なら `false`
- `isMe` は「ログイン中の利用者本人か」
- `edited` は `updatedAt > createdAt`
- `url` は S3 の公開 URL（[image-storage-design.md](image-storage-design.md)）

```json
{
  "id": "0199c1f0-7b2a-7c3d-8e4f-123456789abc",
  "author": { "id": "0199b000-...", "username": "alice", "displayName": "アリス", "avatarUrl": "https://.../avatars/.../x.png" },
  "body": "はじめての投稿",
  "images": [ { "id": "0199c1f0-...", "url": "https://.../posts/8f3a....jpg" } ],
  "likeCount": 3,
  "commentCount": 1,
  "likedByMe": false,
  "edited": false,
  "createdAt": "2026-10-06T05:12:34Z"
}
```

## 4. エンドポイント一覧

| 機能 | メソッドとパス | 入力 | 応答 | 文書 |
| --- | --- | --- | --- | --- |
| 登録 | `POST /api/auth/register` | username, displayName, email, password | 201 { accessToken, user: UserDetail } ＋ Cookie | [auth](features/auth.md) |
| ログイン | `POST /api/auth/login` | email, password | 200 { accessToken, user } ＋ Cookie | auth |
| 更新 | `POST /api/auth/refresh` | Cookie | 200 { accessToken, user } ＋ 新しい Cookie | auth |
| ログアウト | `POST /api/auth/logout` | Cookie | 204。Cookie を消す | auth |
| 自分 | `GET /api/users/me` | | UserDetail | [profile](features/profile.md) |
| プロフィール更新 | `PATCH /api/users/me` | displayName, bio | UserDetail | profile |
| アイコン更新 | `PUT /api/users/me/avatar` | multipart: file | 200 { avatarUrl } | profile |
| プロフィール | `GET /api/users/{username}` | | UserDetail | profile |
| その人の投稿 | `GET /api/users/{username}/posts` | cursor, limit | Post の一覧 | profile |
| フォロワー | `GET /api/users/{username}/followers` | cursor, limit | UserCard の一覧 | [follow](features/follow.md) |
| フォロー中 | `GET /api/users/{username}/following` | cursor, limit | UserCard の一覧 | follow |
| フォロー／解除 | `PUT` / `DELETE /api/users/{username}/follow` | | 204 | follow |
| ユーザー検索 | `GET /api/users` | q, cursor, limit | UserCard の一覧 | [user-search](features/user-search.md) |
| 投稿 | `POST /api/posts` | multipart: body, images（0〜4） | 201 Post | [post](features/post.md) |
| 投稿詳細 | `GET /api/posts/{id}` | | Post | post |
| 投稿の編集 | `PATCH /api/posts/{id}` | body | Post | post |
| 投稿の削除 | `DELETE /api/posts/{id}` | | 204 | post |
| タイムライン | `GET /api/timeline/following`、`GET /api/timeline/all` | cursor, limit | Post の一覧 | [timeline](features/timeline.md) |
| いいね／解除 | `PUT` / `DELETE /api/posts/{id}/like` | | 204 | [like](features/like.md) |
| いいねした人 | `GET /api/posts/{id}/likes` | cursor, limit | UserCard の一覧 | like |
| コメント一覧 | `GET /api/posts/{id}/comments` | cursor, limit | Comment の一覧 | [comment](features/comment.md) |
| コメント投稿 | `POST /api/posts/{id}/comments` | body | 201 Comment | comment |
| コメント削除 | `DELETE /api/comments/{id}` | | 204 | comment |
| ヘルスチェック | `GET /api/health` | | 200 `{"status":"UP","database":"UP"}` または 503 | — |

- `{username}` は大文字小文字を区別せずに引く
- ヘルスチェックは、今の `GET /` を `/api/health` へ移す。応答は変えない。nginx が `/api/` だけを転送するため
- `POST /api/posts` は画像が無くても multipart で送る（1 つの API に統一する）
- 投稿の編集は本文だけなので JSON

## 5. multipart の規約

| 項目 | 内容 |
| --- | --- |
| 投稿 | 部品名 `body`（テキスト）と `images`（ファイル、0〜4 個） |
| アイコン | 部品名 `file`（ファイル、1 個） |
| 大きさ | 投稿画像は 1 枚 5 MB、アイコンは 2 MB。1 要求の上限は 21 MB。Spring の `spring.servlet.multipart.max-file-size` / `max-request-size` と nginx の `client_max_body_size` の両方で制限する |
| 形式 | JPEG / PNG / GIF / WebP。申告された Content-Type ではなく中身の先頭バイトで判定する |
| 超過 | 大きさ超過は 413、形式違いは 415、枚数超過は 422 |

## 6. ステータスコードの使い分け

| コード | 使う場面 |
| --- | --- |
| 200 | 取得・更新の成功 |
| 201 | 作成の成功 |
| 204 | 本文の無い成功（削除、いいね、フォロー、ログアウト） |
| 400 | 要求の形が壊れている（JSON の構文、cursor の形式、multipart の部品不足） |
| 401 | 認証がない・切れている。ログイン失敗 |
| 403 | 認証はあるが、その資源を触る権限がない |
| 404 | 資源が無い。存在しない URL |
| 409 | 重複（ユーザー名、メールアドレス） |
| 413 | ファイルが大きすぎる |
| 415 | 画像の形式が対象外 |
| 422 | 入力の内容が規則に合わない |
| 429 | 回数制限（nginx） |
| 500 | 想定外の失敗 |
| 503 | DB に届かない（ヘルスチェック） |

# プロフィール

- 日付: 2026-10-06
- 要件: [requirements.md](../requirements.md) の 3.2
- 設計: [image-storage-design.md](../image-storage-design.md)（アイコン）、[screen-design.md](../screen-design.md)
- Issue: 実装の順序の 4「プロフィールを作る」（表示と編集）、5「画像を扱う」（アイコン）

## 1. 概要

自分と他人のプロフィールを見る。自分の表示名・自己紹介・アイコンを変える。ユーザー名とメールアドレスは変えられない。

## 2. 画面

### プロフィール `/users/:username`

| 要素 | 内容 |
| --- | --- |
| アイコン | 画像。未設定なら頭文字 |
| 表示名、`@ユーザー名` | |
| 自己紹介 | 改行をそのまま表示。空なら出さない |
| 登録日 | 「2026年10月に登録」 |
| フォロー中 n、フォロワー n | 押すとそれぞれの一覧へ |
| ボタン | 本人なら「プロフィールを編集」→ `/settings/profile`。他人ならフォローボタン。フォローボタンは Issue 9 で足す（[requirements.md](../requirements.md) の「Issue ごとの仮の振る舞い」） |
| 投稿一覧 | その人の投稿を新しい順に無限スクロール。投稿カードを使う |

- 存在しないユーザー名は「見つかりません」の画面
- ユーザー名は大文字小文字を区別せず引く。`/users/Alice` でも alice のプロフィールが出る

### プロフィール編集 `/settings/profile`

| 項目 | 入力 | 検証 | 誤りの文言 |
| --- | --- | --- | --- |
| アイコン | 画像ファイル。今の画像（または頭文字）のプレビューと「画像を変更」 | JPEG / PNG / GIF / WebP、2 MB まで | 画像は 2 MB 以内にしてください／JPEG、PNG、GIF、WebP の画像を選んでください |
| 表示名 | テキスト | 1〜50 文字 | 1〜50 文字で入力してください |
| 自己紹介 | 複数行テキスト。残り文字数 | 0〜160 文字 | 160 文字以内で入力してください |

- ボタン「保存」。表示名と自己紹介は `PATCH /api/users/me`、アイコンは選んだ時点で `PUT /api/users/me/avatar` を呼ぶ（別の要求）
- 成功したら通知「保存しました」を出し、プロフィールへ戻る
- ユーザー名とメールアドレスは表示するが変えられない。メールアドレスは `GET /api/users/me`（Me）から取る
- 画面の末尾に「退会」の節を置く（[auth.md](auth.md) の 2 章）

## 3. API

| API | 入力 | 応答 |
| --- | --- | --- |
| `GET /api/users/me` | | 200 Me（UserDetail ＋ email。`isMe` true） |
| `PATCH /api/users/me` | `{ "displayName": "...", "bio": "..." }` | 200 Me。422 で検証の失敗 |
| `PUT /api/users/me/avatar` | multipart: `file` | 200 `{ "avatarUrl": "..." }`。413 `FILE_TOO_LARGE`、415 `UNSUPPORTED_IMAGE_TYPE`、422（空） |
| `GET /api/users/{username}` | | 200 UserDetail。404 |
| `GET /api/users/{username}/posts` | cursor, limit | 200 Post の一覧。404 |

`PATCH` は両方の項目を必須にする（部分更新ではなく、画面の値をそのまま送る）。

## 4. 処理の流れ

アイコンの更新は [image-storage-design.md](../image-storage-design.md) の 4 章。新しいキーで上げ、DB を更新してから古いキーを消す。

## 5. データ

`users`（表示名、自己紹介、`avatar_key`、`updated_at`）。投稿一覧は `posts (user_id, id)` の索引を使う。
`followersCount` は `follows.followee_id`、`followingCount` は `follows.follower_id` を数える。

## 6. テストの期待一覧

### 正常系

- 自分のプロフィールを取ると `isMe` が true、`isFollowing` が false
- 他人のプロフィールを取ると `isMe` が false。フォローしていれば `isFollowing` が true（`isFollowing` は Issue 9 で確かめる。それまでは false）
- `followersCount` と `followingCount` が実際の数と一致する（Issue 9 で確かめる。それまでは 0）
- 表示名と自己紹介を更新すると応答に反映され、`updated_at` が進む
- アイコンを更新すると新しい `avatarUrl` が返り、`users.avatar_key` が新しいキーになり、古いキーが削除される
- アイコンが未設定なら `avatarUrl` は null
- その人の投稿一覧が新しい順に返る

### 入力の境界

- 表示名: 空白だけは 422、50 文字は通る、51 文字は 422
- 自己紹介: 空は通る、160 文字は通る、161 文字は 422
- アイコン: 2 MB は通る、2 MB ＋ 1 バイトは 413。PNG / GIF / WebP は通る。SVG とテキストは 415。空のファイルは 422

### 権限

- 未ログインで `GET /api/users/alice` は 401
- 更新は `/me` だけなので、他人の更新は URL で指定できない
- 他人のプロフィールと各一覧の応答に `email` が含まれない。`email` が入るのは `/me` と登録・ログイン・更新の応答だけ

### 異常系

- S3 への保存が失敗したら 500 で、`avatar_key` は変わらない
- 古い画像の削除が失敗しても 200 で、WARN の出来事 `image.delete_failed` が出る（[logging-design.md](../logging-design.md) の 3 章）
- 存在しないユーザー名は 404
- 画面: 保存に失敗しても入力は消えない

### 重複と一意性

この機能には無い（ユーザー名とメールアドレスは変えられない）。

### 並び順とページング

- 投稿一覧は id の降順。21 件あれば `nextCursor` が 20 件目の id、`cursor` を付けると続きが重複なく返る

### その他

- `/users/Alice` と `/users/alice` が同じ人を返す
- 画面: 自己紹介の改行がそのまま表示される。HTML を書いても文字として表示される

## 7. 手動確認の手順

1. プロフィール編集で表示名と自己紹介を変え、保存 → プロフィールに反映される
2. アイコンを選ぶ → 即座に新しい画像になる。S3 の開発用バケットに `avatars/<id>/...` が 1 つだけある（古いものは消えている）
3. 2 MB を超える画像、SVG を選ぶ → 選んだ時点で文言が出る
4. 他人のプロフィールを開く → 「編集」ではなくフォローボタンが出る
5. 存在しないユーザー名の URL → 「見つかりません」
6. スマホ幅で崩れない

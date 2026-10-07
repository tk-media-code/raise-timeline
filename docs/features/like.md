# いいね

- 日付: 2026-10-06
- 要件: [requirements.md](../requirements.md) の 3.5
- 設計: [api-conventions.md](../api-conventions.md)、[database-design.md](../database-design.md)
- Issue: 実装の順序の 7「いいねを作る」

## 1. 概要

投稿にいいねを付ける・外す。1 人 1 回。自分の投稿にも付けられる。いいねした人の一覧を見られる。

## 2. 画面

### いいねボタン（投稿カード）

- ハートと数。自分が付けていれば塗りつぶし
- 押した瞬間に見た目と数を変え、裏で API を呼ぶ。失敗したら元に戻して通知する（楽観的更新）
- 連打しても最後の状態に収束する（`useMutation` の `scope` を投稿ごとに分け、同じ投稿への要求を順番に送る）

### いいねした人 `/posts/:id/likes`

- 投稿詳細のいいね数を押すと移る
- ユーザーカードの無限スクロール。新しい順
- 0 件なら「まだいいねがありません」

## 3. API

| API | 応答 |
| --- | --- |
| `PUT /api/posts/{id}/like` | 204。既に付けていても 204。404 |
| `DELETE /api/posts/{id}/like` | 204。付けていなくても 204。404 |
| `GET /api/posts/{id}/likes` | 200 UserCard の一覧（新しい順）。404 |

## 4. 処理の流れ

- 付ける: `INSERT ... ON CONFLICT DO NOTHING` で行を入れる。既にあれば何もせず 204（一意制約の違反でトランザクションを中断させない）
- 外す: `likes` から行を消す。無くても 204
- 投稿の `likeCount` と `likedByMe` は、投稿を返すときに `likes` を数える（[timeline.md](timeline.md) の 4 章）
- 一覧: 並びとカーソルは `likes.id`。`nextCursor` には `likes.id` を入れ、画面はそのまま送り返す。各行の `isFollowing` は `EXISTS` の副問い合わせで取る（[database-design.md](../database-design.md) の 5 章）

## 5. データ

`V3__likes.sql` で `likes` を作る。一意 `(post_id, user_id)`、索引 `(post_id, id)`。

## 6. テストの期待一覧

### 正常系

- 付けると 204。投稿を取り直すと `likeCount` が 1 増え、`likedByMe` が true
- 外すと 204。`likeCount` が戻り、`likedByMe` が false
- 自分の投稿にも付けられる
- いいねした人の一覧に、付けた人が新しい順に UserCard で返る。`isFollowing` が付く（`isFollowing` は Issue 9 で確かめる。それまでは false）

### 入力の境界

- 一覧が 0 件なら `items` が空で `nextCursor` が null
- 21 人なら `items` が 20 で `nextCursor` が 20 件目の `likes.id`

### 権限

- 未ログインは 401
- 存在しない投稿に付ける・外す・一覧は 404

### 異常系

- 画面: API が失敗したら、ハートと数が元に戻り、通知が出る
- 付ける直前に投稿が消され、外部キー違反（`likes_post_id_fkey`）になったら 404 `NOT_FOUND`。500 にならない（Mapper の代役に外部キー違反を投げさせて確かめる）
- 本人への外部キー違反（`likes_user_id_fkey`。退会と同時に付けた）は 401 `UNAUTHENTICATED`

### 重複と一意性

- 2 回付けても `likes` は 1 行で、2 回目も 204
- 付けていない投稿を外しても 204
- 同時に 2 回付けても 1 行（`ON CONFLICT DO NOTHING` で 204）

### 並び順とページング

- 一覧は `likes.id` の降順。`nextCursor` は 20 件目の `likes.id` で、`cursor` に付けると続きが重複なく返る

### 画面

- 押した瞬間にハートが塗りつぶされ、数が 1 増える
- いいね数を押すと一覧へ移る

## 7. 手動確認の手順

1. 投稿にいいね → 即座に塗りつぶしと数が変わる。リロードしても保たれる
2. もう一度押す → 外れる
3. 別のユーザーでもいいねし、投稿詳細のいいね数を押す → 2 人が新しい順に出る

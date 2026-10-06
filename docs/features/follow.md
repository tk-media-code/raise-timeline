# フォロー／フォロワー

- 日付: 2026-10-06
- 要件: [requirements.md](../requirements.md) の 3.7
- 設計: [api-conventions.md](../api-conventions.md)、[database-design.md](../database-design.md)
- Issue: 実装の順序の 7「フォローを作る」

## 1. 概要

他の人をフォローする・解除する。承認は要らない。自分自身はフォローできない。フォロー中とフォロワーの一覧を見られる。
フォローすると、その人の投稿が「フォロー中」のタイムラインに出る。

## 2. 画面

### フォローボタン（プロフィール、ユーザーカード）

- 未フォロー: 「フォロー」。フォロー中: 「フォロー中」、マウスを載せると「解除」
- 自分には出さない
- 押した瞬間に見た目を変え、裏で API を呼ぶ。失敗したら元に戻して通知する

### フォロワー `/users/:username/followers`、フォロー中 `/users/:username/following`

- プロフィールの数を押すと移る。上部にその人の表示名と、2 つの一覧を切り替えるタブ
- ユーザーカードの無限スクロール。新しい順
- 0 件なら「フォロワーはいません」「誰もフォローしていません」

### プロフィールの数

フォロー・解除すると、プロフィールの「フォロワー n」も合わせて変える（キャッシュを更新する）。

## 3. API

| API | 応答 |
| --- | --- |
| `PUT /api/users/{username}/follow` | 204。既にフォロー中でも 204。自分自身は 422。404 |
| `DELETE /api/users/{username}/follow` | 204。フォローしていなくても 204。404 |
| `GET /api/users/{username}/followers` | 200 UserCard の一覧（新しい順）。404 |
| `GET /api/users/{username}/following` | 200 UserCard の一覧（新しい順）。404 |

## 4. 処理の流れ

- フォロー: 相手を `username` で引き、`follows` に `(follower_id = 自分, followee_id = 相手)` を `INSERT ... ON CONFLICT DO NOTHING` で入れる。既にあれば何もせず 204（一意制約の違反でトランザクションを中断させない）。自分自身なら 422
- 解除: 行を消す。無くても 204
- 一覧: フォロワーは `followee_id = その人`、フォロー中は `follower_id = その人` で引き、`users` と結合する。各行の `isFollowing` は「ログイン中の利用者がその行の人をフォローしているか」
- 一覧の並びとカーソルは `follows.id`。`nextCursor` には `follows.id` を入れ、画面はそのまま送り返す。各行の `isFollowing` は `EXISTS` の副問い合わせで取る（[database-design.md](../database-design.md) の 5 章）

## 5. データ

`V5__follows.sql` で `follows` を作る。一意 `(follower_id, followee_id)`、チェック `follower_id <> followee_id`、索引 `(followee_id, id)` と `(follower_id, id)`。

「フォロー中」のタイムラインは [timeline.md](timeline.md)。

## 6. テストの期待一覧

### 正常系

- フォローすると 204。相手のプロフィールの `isFollowing` が true、`followersCount` が 1 増え、自分の `followingCount` が 1 増える
- 解除すると 204。それぞれ戻る
- フォロワー一覧に、フォローした人が新しい順に UserCard で返る
- フォロー中一覧に、フォローしている人が新しい順に返る
- フォローすると、その人の投稿が「フォロー中」のタイムラインに出る。解除すると出なくなる

### 入力の境界

- 自分自身をフォローすると 422 で行は増えない
- 一覧が 0 件なら `items` が空で `nextCursor` が null。21 人なら `items` が 20 で `nextCursor` が 20 件目の `follows.id`

### 権限

- 未ログインは 401
- 存在しないユーザー名は 404

### 異常系

- 画面: API が失敗したら、ボタンと数が元に戻り、通知が出る

### 重複と一意性

- 2 回フォローしても `follows` は 1 行で、2 回目も 204
- フォローしていない人を解除しても 204
- A が B をフォローしても、B が A をフォローしたことにはならない（向きがある）

### 並び順とページング

- 一覧は `follows.id` の降順。`nextCursor` は 20 件目の `follows.id` で、`cursor` に付けると続きが重複なく返る

### 画面

- 押した瞬間にボタンが「フォロー中」になり、プロフィールのフォロワー数が 1 増える
- 自分のプロフィールとユーザーカードにフォローボタンが出ない

## 7. 手動確認の手順

1. 他人のプロフィールでフォロー → ボタンとフォロワー数が即座に変わる。リロードしても保たれる
2. フォロワー一覧・フォロー中一覧を開く → 正しい人が出る
3. 相手の投稿が「フォロー中」に出る。解除すると出なくなる

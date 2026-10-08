---
description: このリポジトリのログの読み方と書き方。読む手順と項目名は docs/logging-design.md が正本
---

# ログ

- ログの読み方（「不具合の調査では、推測でコードを読む前に、まずログとエラー出力を読む」という原則は、ハーネスが配る `development-flow` ルールのスキル対応表にある。ここには、このリポジトリでの読み方だけを書く）: ローカルは README の「ログを読む」のコマンドを使う。ERROR の行の `http.request.id` を控え、同じ ID の行を時刻順に読む。スタックトレースは `error.stack_trace` にある。SQL とその引数はローカルの既定（DEBUG）で出ている。出ていなければ `.env` の `LOG_LEVEL_APP` を確かめる。本番は `docs/logging-design.md` 10 章の保存した検索を使う
- ログを書くときは `docs/logging-design.md` に従う。項目名は `LogFields`、出来事の名前は `LogEvents` の定数を使い、文字列を直接書かない。`message` は日本語の固定文にし、変わる値は項目に入れる
- MDC にある項目（`http.request.id` `client.ip` `user.id`）を `addKeyValue` で行に重ねて足さない。行が壊れる
- パスワード、トークン、メールアドレス、投稿やコメントの本文をログに書かない

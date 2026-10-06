# raise-timeline 設計書

- 日付: 2026-10-06

raise-timeline は、X（旧 Twitter）を模した学習用の SNS アプリです。この `docs/` には要件定義書と設計書を置きます。
プログラミングスクールの課題として作りますが、本番環境に出して複数の人が実際に使うことを前提にしています。

## 読む順番

はじめて読む人は、横断文書を上から順に読んでから、機能別文書に進んでください。

| 順 | 文書 | 中身 |
| --- | --- | --- |
| 1 | [requirements.md](requirements.md) | 要件定義書。目的、利用者、機能要件、非機能要件、範囲外、実装の順序 |
| 2 | [architecture.md](architecture.md) | システム構成。ローカルと本番（AWS、仮決め）、部品の役割、設定値の置き場、セキュリティ対策 |
| 3 | [database-design.md](database-design.md) | DB 設計。ER 図、テーブル定義、インデックス、マイグレーション |
| 4 | [auth-design.md](auth-design.md) | 認証認可設計。JWT とリフレッシュトークン、パスワード、認可の規則 |
| 5 | [api-conventions.md](api-conventions.md) | API の共通規約とエンドポイント一覧 |
| 6 | [error-handling-design.md](error-handling-design.md) | エラーハンドリング設計。応答の形式、分類表、画面での扱い |
| 7 | [logging-design.md](logging-design.md) | ログ設計。レベルの基準、残す出来事、項目名、本番の集め方と通知、調べ方 |
| 8 | [image-storage-design.md](image-storage-design.md) | 画像保存設計。S3 のバケットとキー、アップロードの流れ、権限 |
| 9 | [screen-design.md](screen-design.md) | 画面設計の横断部分。画面一覧、遷移、共通レイアウト、共通部品 |
| 10 | [test-strategy.md](test-strategy.md) | テスト方針。確かめる観点、層ごとの道具、代役の使い分け |
| 11 | [features/auth.md](features/auth.md) | 登録・ログイン・ログアウト・退会 |
| 12 | [features/profile.md](features/profile.md) | プロフィールの表示と更新、アイコン画像 |
| 13 | [features/post.md](features/post.md) | 投稿の作成・編集・削除、画像添付 |
| 14 | [features/timeline.md](features/timeline.md) | タイムライン（フォロー中／すべて） |
| 15 | [features/like.md](features/like.md) | いいね |
| 16 | [features/comment.md](features/comment.md) | コメント |
| 17 | [features/follow.md](features/follow.md) | フォロー／フォロワー |
| 18 | [features/user-search.md](features/user-search.md) | ユーザー検索 |

## 文書の切り方

横断文書と機能別文書の二層です。

- **横断文書**は、アプリ全体に関わる決めごとを持つ。DB の全テーブル、API の共通規約、エラーの形式など
- **機能別文書**は、その機能の画面の項目、API の入出力、処理の流れ、テストの期待一覧を持つ
- 同じことを 2 か所に書かず、参照で結ぶ。機能別文書から横断文書を参照する向きが基本

## 用語

| 用語 | 意味 |
| --- | --- |
| ユーザー名（username） | `@` を付けて示す識別子。英数字と `_` の 3〜20 文字。登録後は変えない。プロフィールの URL に使う |
| 表示名（display name） | 画面に出す名前。1〜50 文字。いつでも変えられる |
| 自己紹介（bio） | プロフィールの短い紹介文。0〜160 文字 |
| アイコン（avatar） | プロフィールの画像。1 枚 |
| 投稿（post） | 本文（0〜280 文字）と 0〜4 枚の画像 |
| タイムライン | 投稿を新しい順に並べた一覧。「フォロー中」と「すべて」の 2 タブ |
| フォロー | ある人の投稿を自分の「フォロー中」に流す関係。承認は要らない |
| フォロワー／フォロー中 | 自分をフォローしている人／自分がフォローしている人 |
| いいね | 投稿への反応。1 人 1 回 |
| コメント | 投稿へのテキストの返答。コメントへの返信（入れ子）はしない |
| アクセストークン | API を呼ぶときに `Authorization` ヘッダーに付ける、有効期限 1 時間の JWT |
| リフレッシュトークン | アクセストークンを取り直すための、有効期限 30 日のトークン。httpOnly Cookie に置く |
| カーソル | 一覧の続きを読むための目印。前の応答の `nextCursor` をそのまま次の要求に付ける値で、画面は中身を解釈しない |
| Problem Details | エラー応答の標準形式（RFC 9457） |
| requestId | 要求ごとに 1 つ付く ID。応答ヘッダー `X-Request-Id`、エラー本文の `requestId`、ログの `http.request.id` が同じ値 |
| ECS | Elastic Common Schema。ログの項目名の辞書。Spring Boot が組み込みで出す JSON の形式でもある |
| MDC | 要求の間ずっと付く値（requestId、利用者 id、接続元の IP）を置く仕組み。その間に出るすべてのログ行に自動で載る |
| 代役（テストダブル） | 自動テストで本物の部品の代わりに置く、振る舞いを指示できる部品 |

## 書き方の約束

- 決めたことには、採らなかった案と理由も残す。後から同じ検討を繰り返さないため
- 文書の変更も Issue → ブランチ → PR で入れる（`.claude/rules/development-flow.md`）
- 実装の計画は `plans/` に置き、Git では管理しない。設計書は Git で管理する
- 土台づくりの設計は [superpowers/specs/](superpowers/specs/) にあり、その時点の記録としてそのまま残す

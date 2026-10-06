# ログ設計

- 日付: 2026-10-07

## 1. 目的と方針

ログは、問題が起きたときに人と AI が原因を特定するための材料であり、本番で問題に気づくための信号でもある。
機械と AI が確実に読める形で残し、1 件の要求を端から端まで追えるようにする。

| 方針 | 内容 |
| --- | --- |
| 1 行 1 JSON | 項目名を固定した JSON を 1 行ずつ出す。文章ではなく項目で書くので、「status が 500 の行」を確実に拾える |
| 項目名は ECS | Elastic 社が公開している項目名の辞書 ECS（Elastic Common Schema）に合わせる。Spring Boot 4.1 に組み込みの形式で、追加の部品は要らない |
| ローカルと本番で同じ | ローカルの `docker compose logs` に出るものが本番の CloudWatch Logs と同じ形。AI がローカルで読んだ経験が本番でそのまま使える |
| requestId で追う | 要求ごとの ID と利用者 id を、その要求の間に出るすべての行に自動で付ける |
| 気づく仕組みは AWS の標準機能 | CloudWatch のメトリクスフィルタとアラーム、SNS のメール配信。コードを書かず、無料枠に収まる |
| 将来の監視ツール | Datadog などを入れるときも、アプリのコードは変えない。送り方と項目名の対応を設定するだけ（11 章） |

### 範囲外

| 対象 | 理由 |
| --- | --- |
| ブラウザで起きた問題をサーバーへ報告する口 | 回数制限・本文の上限・偽の報告への対策と、圧縮された JavaScript の行番号を戻す仕組み（source map）が要る。機能が揃う前に作るものではない。代わりに画面のエラー通知に requestId を添える（6 章）。必要になったら Issue にする |
| ダッシュボード | この規模では見る機会が少ない。保存した検索（10 章）で足りる |
| 外部の監視サービス | 今は入れない。移るときの手順だけ残す（11 章） |
| RDS・EC2 のインフラの監視 | ログの設計ではない。本番構築の Issue で決める（9 章に名前だけ残す） |

## 2. レベルの基準

| レベル | 基準 | 本番での扱い |
| --- | --- | --- |
| ERROR | 人が対応しないと直らない。想定外の例外で 500 を返した、起動に失敗した、設定が欠けている | 1 件でもメール通知。必ず調べる |
| WARN | 処理は続けられたが、放置すると問題になる。S3 の削除失敗、1 秒を超えた応答、外部サービスの一時的な失敗 | 通知しない。数の推移を週に 1 度見る |
| INFO | 正常な出来事の記録。要求 1 件につき 1 行、業務上の出来事、起動完了 | 保存するだけ |
| DEBUG | 開発者が追うための詳細。SQL とその引数、トークン検証の内訳 | 出さない。ローカルでは環境変数 `LOG_LEVEL_APP=DEBUG` で有効にする |
| TRACE | 使わない | |

### 3 つの規則

1. **1 つの事象は 1 回だけ書く。** 例外は、捕まえた場所で記録して握りつぶすか、記録せずに投げ直すかのどちらかにする。両方やると同じ失敗が 2 行になり、数えたときに水増しされる。500 は例外ハンドラが 1 回だけ ERROR で書く
2. **4xx は別の行にしない。** 要求ログ（3 章）に status と code が載るので、それで足りる。ログイン失敗や期限切れのトークンは利用者の操作として起きる想定内の失敗なので、ERROR にも WARN にもしない。攻撃の兆候は 1 件の重さではなく「数」で捉え、通知の条件にする（9 章）
3. **業務上の出来事として残すのは、取り返しがつかない操作と、セキュリティに関わる出来事だけ。** 投稿の作成や編集は要求ログに `POST /api/posts 201` と利用者 id が残るので足りる

## 3. 残す出来事

`event.action` は出来事の名前で、検索と集計の鍵になる。利用者 id と requestId は 4 章の仕組みで全行に自動で付くので、表の「付ける値」はそれ以外。

| event.action | レベル | 付ける値 | いつ |
| --- | --- | --- | --- |
| `http.request` | INFO。1 秒を超えたら WARN | メソッド、パス、クエリ、status、所要時間、エラー応答の code | 要求 1 件が終わるたび。`GET /api/health` の 200 だけは DEBUG に落とす。ALB が 30 秒ごとに叩くため |
| `http.request.failed` | ERROR | 例外の種類・文言・スタックトレース、code | 想定外の例外で 500 を返した |
| `auth.register` | INFO | 利用者 id | 登録 |
| `auth.login.succeeded` | INFO | 利用者 id | ログイン成功 |
| `auth.login.failed` | INFO | 無し。メールアドレスの有無も書かない | ログイン失敗 |
| `auth.refresh.failed` | INFO | 無し | リフレッシュトークンが無い・期限切れ・ログアウト済み |
| `auth.logout` | INFO | 利用者 id | ログアウト |
| `user.withdrew` | INFO | 利用者 id | 退会 |
| `post.deleted` | INFO | 利用者 id、投稿 id | 投稿の削除 |
| `comment.deleted` | INFO | 利用者 id、コメント id | コメントの削除 |
| `image.delete_failed` | WARN | 消せなかった S3 のキー | S3 の削除失敗。応答は成功のまま（[error-handling-design.md](error-handling-design.md)） |

機能別文書に書かれている「WARN で残す」「INFO で残す」は、この表が正本で、文書からはここを参照する。

### 要求ログ

- 1 つのフィルタ `RequestLogFilter` が、requestId の検証・生成・応答ヘッダー、MDC への登録、要求ログの出力をまとめて行う。Spring Security より外側で動く
- 所要時間はフィルタに入ってから出るまでの時間。1 秒を超えたら同じ 1 行をレベルだけ WARN にする。1 秒は非機能要件の「通常の操作は 1 秒以内」から取った値で、定数にする
- エラー応答の `code` は、例外ハンドラと Spring Security のハンドラが Problem Details を書くときに要求の属性（request attribute）に置き、要求ログがそれを `event.code` として読む。成功時は付かない
- 500 の ERROR 行は例外ハンドラ `ApiExceptionHandler` が書く。要求ログの行は status と code を持つだけで、例外は持たない。2 行は requestId で結びつく

## 4. 項目名と形式

### 1 行の形

Spring Boot の ECS 形式を使う。要求ログの実例。

```json
{"@timestamp":"2026-10-06T14:44:48.000Z","log":{"level":"INFO","logger":"com.tkmedia.raisetimeline.web.RequestLogFilter"},"process":{"pid":1,"thread":{"name":"http-nio-8080-exec-1"}},"service":{"name":"raise-timeline","environment":"local"},"message":"要求を処理した","http":{"request":{"id":"req-123","method":"GET"},"response":{"status_code":200}},"client":{"ip":"172.18.0.1"},"user":{"id":"0199b000-..."},"url":{"path":"/api/posts","query":"limit=20"},"event":{"action":"http.request","duration":12345678},"ecs":{"version":"8.11"}}
```

### 項目

Spring Boot が自動で付ける項目と、このプロジェクトが足す項目に分かれる。足す項目の名前は ECS の辞書から選び、辞書に無いものだけ `app` という自前の置き場に入れる。

| 項目 | 誰が付けるか | 中身 |
| --- | --- | --- |
| `@timestamp` `log.level` `log.logger` `process.pid` `process.thread.name` `service.name` `service.environment` `message` `ecs.version` | Spring Boot | 時刻は UTC。`service.environment` は `local` か `production`。`service.version` は jar の版が取れるときだけ付く |
| `error.type` `error.message` `error.stack_trace` | Spring Boot | 例外を渡した行にだけ付く。根本原因（cause）を先頭にする設定にする |
| `http.request.id` `client.ip` `user.id` | MDC。要求の間ずっと | requestId、接続元の IP、ログイン中の利用者 id。要求の間に出るすべての行に付く。`user.id` は認証フィルタがトークンを検証したあとに置くので、未ログインの要求には付かない |
| `http.request.method` `url.path` `url.query` `http.response.status_code` `event.duration` | 要求ログ | 所要時間はナノ秒。ECS と Datadog の両方がナノ秒を標準にしている |
| `event.action` `event.code` | 出来事の行 | 出来事の名前（3 章）と、エラー応答の `code`（[error-handling-design.md](error-handling-design.md) の分類表） |
| `app.post.id` `app.comment.id` `app.image.keys` | 出来事の行 | 辞書に無い、このアプリ固有の値。`app.image.keys` は文字列の配列 |

### MDC

MDC は「要求の間ずっと付く値」を置く仕組み。要求の最初に値を置き、要求の最後に消すと、その間にどこで書いたログにも自動で載る。
MyBatis が出す SQL のログにも利用者 id が付くので、「この人のこの操作で流れた SQL」を requestId でまとめて追える。

`client.ip` は `HttpServletRequest#getRemoteAddr()` の値。本番は nginx が利用者の IP を `X-Forwarded-For` に入れて渡し、Spring Boot は
`server.forward-headers-strategy=native`（Tomcat の RemoteIpValve。私設アドレスからの `X-Forwarded-For` だけを信用する）で復元する。
Spring Boot に nginx 以外から届く経路は無い（Compose のネットワークの中だけ）。ローカルでは Vite の proxy の接続元になる。

### 守らないとログ行が壊れる 2 つの約束

実際に確かめた挙動。どちらも行の途中で出力が止まり、次の行がつながって JSON として読めなくなる。

1. **自前の項目を `error` `log` `process` `service` `ecs` `message` `@timestamp` の下に置かない。** Spring Boot 自身が書く項目とぶつかる。エラー応答の code を `error.code` にはできないので `event.code` にする
2. **同じ名前を MDC と行の項目の両方に入れない。** 「同じ名前が重複している」という例外で行が壊れる

防ぐ手として、項目名は Java の 1 つのクラス `LogFields` に定数として集め、文字列を直接書かない。
さらに、全項目を載せた 1 行を出して JSON として読めることを確かめるテストを入れる（12 章）。

### メッセージの書き方

- `message` は日本語の固定文で、「要求を処理した」「ログインに失敗した」のように何が起きたかだけを書く。既存コードの「DB への問い合わせに失敗した」と同じ流儀
- 変わる値は文に埋めず、項目に入れる。文に埋めると「status が 500 の行」を確実に拾えなくなる
- 出来事は SLF4J の fluent API で書く。`log.atInfo().addKeyValue(LogFields.EVENT_ACTION, "post.deleted").addKeyValue(LogFields.APP_POST_ID, postId).log("投稿を削除した")`

### 設定

`application.properties` に次を足す。コードは書かない。

| 設定 | 意味 |
| --- | --- |
| `logging.structured.format.console=ecs` | JSON にする本体 |
| `logging.structured.ecs.service.environment=${APP_ENV:local}` | 環境名。本番は環境変数で `production` |
| `logging.structured.json.stacktrace.root=first` | 根本原因を先頭に |
| `logging.structured.json.stacktrace.max-length=65536` | CloudWatch Logs の 1 件の上限 256 KB に収める保険 |
| `spring.main.banner-mode=off` | 起動時の ASCII アートを消し、JSON 以外の出力を無くす |
| `logging.level.com.tkmedia.raisetimeline=${LOG_LEVEL_APP:INFO}` | ローカルで DEBUG にする口。MyBatis の SQL も Mapper のパッケージの下で出る |
| `server.forward-headers-strategy=native` | 本番で `client.ip` を利用者の IP にする（上の MDC の節） |

MDC のキー名は ECS の `http.request.id`。API の応答に入る `requestId`（ヘッダー `X-Request-Id` と Problem Details の `requestId`）は変えない。

## 5. 書かないもの

| 書かないもの | 理由と扱い |
| --- | --- |
| パスワード、アクセストークン、リフレッシュトークン、`Authorization` ヘッダー、`Cookie` | 漏れたらなりすましに直結する。要求ヘッダーと本文は DEBUG でも書かない |
| JWT の秘密鍵、DB のパスワード、S3 の認証情報 | 起動時の設定ログにも出ないよう、設定値を文字列にしてログに渡さない |
| メールアドレス | ログイン失敗の行に限らず、どの行にも書かない。利用者を指すときは利用者 id を使う |
| 投稿・コメント・自己紹介の本文、画像の中身 | 利用者の内容物。不具合の調査に要るときは id で DB を引く |
| 要求本文と応答本文そのもの | 上のどれかを含みうる。項目を選んで書く |

書くものは、利用者 id、投稿やコメントの id、接続元の IP アドレス。IP アドレスは個人情報に当たるので、保持期間（8 章）を決めて消す。

**1 つだけ割り切る。** 想定外の例外の文言は、原因の特定に要るので記録する。PostgreSQL の一意制約違反のように、例外の文言に値が入ることがある。
想定内の重複は 409 として処理して例外を記録しないので通常は起きないが、想定外の経路では残りうる。これは保持期間で緩和する。

## 6. 画面での扱い

ブラウザからの報告は作らない（1 章の範囲外）。代わりに、500 の通知に requestId を小さく添える。
「問題が起きました（ID: a1b2c3d4）」の形で、Problem Details の `requestId` をそのまま出す。利用者がこの ID を伝えれば、その 1 件を本番のログから引ける。
通信失敗は応答が無いので requestId も無く、文言だけ出す。

## 7. ローカルでの読み方

人が目で読むときは、`jq` で「時刻 レベル メッセージ requestId」の形に整形する。Gradle の出力など JSON でない行は読み飛ばす。

```bash
docker compose logs --no-log-prefix backend --since 10m | jq -R -r 'fromjson? // empty | "\(.["@timestamp"]) \(.log.level) \(.message) \(.http.request.id // "")"'
```

| したいこと | やり方 |
| --- | --- |
| 1 つの要求だけ読む | 上のコマンドの `fromjson? // empty` の後ろに `| select(.http.request.id == "<requestId>")` を足す |
| ERROR だけ読む | 同じく `| select(.log.level == "ERROR")` を足す。スタックトレースは `.error.stack_trace` に入っている |
| SQL まで見る | `.env` に `LOG_LEVEL_APP=DEBUG` を書き、`docker compose up -d` で backend を作り直す |

AI も同じコマンドを使う。これらは README の「よく使うコマンド」にも書く。

## 8. 本番での集め方

| 項目 | 決めること |
| --- | --- |
| 送り方 | Docker の `awslogs` ログドライバ。コンテナの標準出力をそのまま CloudWatch Logs へ送る。アプリは何もしない。`compose.prod.yml` の各サービスに `logging.driver: awslogs` と `awslogs-region` `awslogs-group` を書く |
| ロググループ | `/raise-timeline/backend` と `/raise-timeline/web` の 2 つ。混ぜると検索の条件が増える |
| ログクラス | Standard。安い方の Infrequent Access はメトリクスフィルタが使えず、通知が作れない。作成後に変えられないので最初から Standard |
| 保持期間 | 90 日。IP アドレスを含むので無期限にしない。この規模なら月 100 MB 前後の見込みで、取り込みも保存も無料枠（月 5 GB）の中 |
| 環境名 | backend に環境変数 `APP_ENV=production` を渡し、`service.environment` で見分ける |

### nginx のログも JSON にする

nginx はブラウザからの全要求を最初に受けるので、Spring Boot に届く前に止めた 413 や 429、静的ファイルの要求はここにだけ残る。
`log_format` に `escape=json` を付けて 1 行 1 JSON にし、項目名は backend と揃える。公式イメージはアクセスログを標準出力に出すので、`awslogs` でそのまま届く。

| 項目 | nginx の変数 |
| --- | --- |
| `@timestamp` | `$time_iso8601` |
| `event.action` | 固定で `http.request` |
| `http.request.id` | `$request_id`。同じ値を `proxy_set_header X-Request-Id $request_id` で backend に渡すので、両方のログを 1 つの ID で突き合わせられる |
| `http.request.method` `url.path` `url.query` `http.response.status_code` `http.response.body.bytes` | `$request_method` `$uri` `$args` `$status` `$body_bytes_sent` |
| `client.ip` `user_agent.original` | `$remote_addr`（ALB の後ろで復元した利用者の IP。[architecture.md](architecture.md)）、`$http_user_agent` |
| `app.request_time_s` `app.upstream_time_s` | `$request_time` `$upstream_response_time`。nginx は掛け算ができずナノ秒にできないので、秒のまま `app` に置く。`$upstream_response_time` は `-` やカンマ区切りになることがあるので文字列 |

nginx のエラーログ（標準エラー出力）は文章のままでよい。量が少なく、集計しない。

## 9. 通知

CloudWatch のメトリクスフィルタで「条件に合う行を数える」規則を付け、数が閾値を超えたらアラームが SNS 経由でメールを送る。復旧したときも届く。

| 名前 | 数えるもの | フィルタ | 条件 | 意味 |
| --- | --- | --- | --- | --- |
| backend-error | backend の ERROR | `{ $.log.level = "ERROR" }` | 5 分間に 1 件以上 | 想定外の例外か起動失敗。必ず調べる |
| web-5xx | web の 5xx | `{ $.http.response.status_code >= 500 }` | 5 分間に 5 件以上 | backend が落ちているか詰まっている |
| login-failed | backend のログイン失敗 | `{ $.event.action = "auth.login.failed" }` | 5 分間に 50 件以上 | 総当たりの兆候。nginx の回数制限（1 IP 毎分 20 回）を抜けてきた量 |
| unhealthy-host | ALB の `UnHealthyHostCount`（ログではなくインフラの値） | — | 1 以上が 2 分続く | アプリが応答していない |

- 4 つとも無料枠の 10 個に収まる。データが無い期間は「正常」として扱う（`TreatMissingData=notBreaching`）
- WARN は通知しない。週に 1 度、保存した検索「WARN の集計」（10 章）で数を見る
- 通知先は SNS トピック `raise-timeline-alerts` に登録したメールアドレス 1 つ
- RDS の空き容量と CPU、EC2 のステータスチェックの監視は、ログの設計ではないので本番構築の Issue で決める

実装はすべて実装の順序「本番環境に出す」で行い、この章はそのための仕様になる。

## 10. 調べ方

人も AI も同じ手順を使う。

### 本番で通知が届いたら

1. CloudWatch Logs Insights で、保存した検索「ERROR の一覧」を実行し、`http.request.id` を控える
2. 検索「requestId で追う」にその ID を入れ、その要求の全行を時刻順に読む。例外の `error.stack_trace` と、直前の SQL や出来事が 1 本の流れで見える
3. ローカルで再現し、Issue を立てて直す

### 保存する検索

本番構築の Issue で Logs Insights に登録する。AI は同じ検索を AWS CLI（`aws logs start-query`）で実行できる。

| 名前 | 対象 | 検索 |
| --- | --- | --- |
| ERROR の一覧 | backend | `fields @timestamp, message, http.request.id, error.type, error.message \| filter log.level = "ERROR" \| sort @timestamp desc \| limit 50` |
| requestId で追う | backend と web | `fields @timestamp, log.level, message, event.action, http.response.status_code, error.stack_trace \| filter http.request.id = "<requestId>" \| sort @timestamp asc` |
| 利用者で追う | backend | `fields @timestamp, log.level, message, event.action, url.path, http.response.status_code \| filter user.id = "<利用者 id>" \| sort @timestamp desc \| limit 100` |
| 遅い要求 | backend | `filter event.action = "http.request" and event.duration > 1000000000 \| stats count() as count, avg(event.duration) / 1000000 as avg_ms by http.request.method, url.path \| sort count desc` |
| WARN の集計 | backend | `filter log.level = "WARN" \| stats count() as count by event.action \| sort count desc` |

### ローカルで

7 章のコマンドで読む。AI に向けた「不具合の調査ではまずログを読む」という指示は `.claude/rules/` に置くのが筋だが、AI への指示ファイルを含めると
文書だけの PR ではなくなるので、ログ基盤の Issue で `add-project-rule` を使って足す。

## 11. 将来、監視ツールを入れるとき

アプリのコードは変えない。やることは 2 つ。

1. **送り方を足す。** EC2 に監視ツールのエージェントを入れてコンテナの標準出力を読ませるか、CloudWatch Logs から転送する
2. **項目名の対応を設定する。** Datadog の場合は次のとおり。ツール側の設定で済む

| このプロジェクト | Datadog の標準属性 |
| --- | --- |
| `log.level` | `status` |
| `log.logger` | `logger.name` |
| `error.type` `error.message` `error.stack_trace` | `error.kind` `error.message` `error.stack` |
| `http.request.method` `http.response.status_code` `url.path` `http.request.id` | `http.method` `http.status_code` `http.url_details.path` `http.request_id` |
| `user.id` | `usr.id` |
| `client.ip` | `network.client.ip` |
| `event.duration` | `duration`（どちらもナノ秒） |

OpenTelemetry で送りたくなったときは、Spring Boot の `management.opentelemetry.logging.export` の設定と Logback の appender の依存を足すだけでよい。

## 12. テストの期待一覧

ログ基盤の Issue で確かめる。テストは標準出力を捕まえて JSON として読み、項目を確かめる（[test-strategy.md](test-strategy.md)）。

1. 要求 1 件につき要求ログが 1 行出て、メソッド・パス・status・所要時間・requestId が揃う
2. `GET /api/health` の 200 では要求ログが INFO では出ない（DEBUG に落ちる）
3. 1 秒を超えた要求は WARN になる（`Clock` を注入して固定する）
4. `X-Request-Id` が `^[A-Za-z0-9-]{1,64}$` に合えば使い、合わなければ作り直し、応答ヘッダーに返し、処理後に MDC が空になる
5. 想定外の例外で 500 を返したとき、ERROR が 1 回だけ出て、`error.stack_trace` と `event.code` が付き、要求ログの status が 500 になる
6. 予定している全項目を載せた 1 行が JSON として読める（4 章の約束の検証）
7. ログイン失敗の行にメールアドレスとパスワードが無い（認証の Issue で確かめる）

## 13. 実装の置き場

| Issue | 担当 |
| --- | --- |
| ログの基盤を作る（実装の順序 1） | 4 章の設定、`RequestLogFilter`、`LogFields`、Problem Details と `ApiExceptionHandler` のうち Spring Security に依らない部分（500 の ERROR 出力と `event.code` の受け渡しを含む）、ヘルスチェックの `GET /` から `GET /api/health` への移動（応答は変えない）、README のログの読み方、`.claude/rules/` の指示、12 章の 1〜6 |
| 認証の基盤を作る（実装の順序 2） | 認証フィルタが `user.id` を MDC に置く。Spring Security のハンドラが `event.code` を置く。`auth.*` の出来事。12 章の 7 |
| 各機能の Issue | 3 章の表の出来事を、その機能で書く |
| 本番環境に出す（実装の順序 11） | 8 章と 9 章のすべて。10 章の保存する検索の登録 |

認証の実装計画（`plans/2026-10-06-auth-foundation.md`）からは、requestId と Problem Details の作業をログ基盤へ移し、`logging.pattern.level` の設定を消す。

## 14. 採らなかった案

| 案 | 採らなかった理由 |
| --- | --- |
| Spring Boot 組み込みの Logstash 形式 | 項目名が `logger_name` のような独自のもので、自前の項目が入れ子にならず `"http.request.id"` のようなドット付きの平らなキーになる。CloudWatch で `$['http.request.id']` と書く必要があり面倒。Datadog が設定なしで読める利点はあるが、対応表で済む |
| 自作の整形器（`StructuredLogFormatter` の実装） | 項目名を完全に自分で決められるが、保守するコードが増える。ECS の辞書があるので要らない |
| ローカルは人向けの 1 行テキスト、本番だけ JSON | 設定が 2 系統になり、AI がローカルで見るものと本番がずれる。項目名の衝突で行が壊れる不具合はローカルでは見つからない |
| ブラウザで起きた問題をサーバーへ報告する口 | 1 章の範囲外のとおり。requestId を画面に出すことで代える |
| Lambda でログを読んで Slack などへ通知 | 通知先と文面は自由になるが、コードとデプロイの手順が増える。必要になってから足す |
| ログクラスを Infrequent Access にして取り込みを半額にする | メトリクスフィルタが使えず通知が作れない。この規模では無料枠に収まるので安くする意味も無い |
| 4xx を INFO の別行で書く（以前のエラーハンドリング設計） | 要求ログに status と code が載るので重複になる |
| WARN も通知する | S3 の削除失敗や遅い応答は 1 件ずつ対応するものではない。数の推移を週に 1 度見れば足りる |
| 実装の順序に「0.5」のような番号で割り込ませる | 読む人が引っかかる。1 番にして以降をずらす |
| MDC のキーを `requestId` のままにする | ECS の `http.request.id` に揃えると、nginx のログと同じ名前で突き合わせられる。API の応答の `requestId` は契約なので変えない |

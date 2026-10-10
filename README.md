# raise-timeline

X（旧 Twitter）を模した、学習用の SNS アプリです。プログラミングスクールの課題として作っていますが、本番環境に出して複数の人が実際に使うことを前提にしています。

主な機能は、登録・ログイン・退会、プロフィール、投稿（画像は 4 枚まで）、タイムライン、いいね、コメント、フォロー、ユーザー検索です。要件と設計は [docs/README.md](docs/README.md) から読めます。

## いまの段階

要件定義・設計と、プロトタイプでの仕様確認が終わり、認証の基盤と、投稿・タイムライン、プロフィール、画像付きの投稿とアイコンを作った段階です。動いているアプリは、登録・ログイン・ログアウトに加えて、投稿（画像は 4 枚まで）の作成・編集・削除と、全員の投稿を新しい順に並べるホームの「すべて」のタイムライン（20 件ずつの無限スクロール）、投稿詳細に加えて、プロフィール（表示、表示名と自己紹介とアイコンの編集、その人の投稿一覧）ができます。画像を押すと大きなビューアで見られます。画像は S3 に保存するので、使うには [画像の保存（S3）の準備](#画像の保存s3の準備) が要ります。ログイン・ログアウトは、同じブラウザの他のタブにも反映されます（1 つのブラウザでログインしているのは、最後にログインした 1 人だけです）。

退会、いいね、コメント、フォロー、ユーザー検索は、まだありません。投稿のいいね数とコメント数、プロフィールのフォロー中とフォロワーの数は 0 の表示で、押せません。

機能は [docs/requirements.md](docs/requirements.md) の「6. 実装の順序」に沿って、1 Issue ずつ作ります。次は「6. 退会を作る」です。

## 仕様を知る

| 知りたいこと | 入口 |
| --- | --- |
| 要件と設計を文書で読む | [docs/README.md](docs/README.md)。読む順番と用語の表があります |
| 画面を触って確かめる | [prototype/index.html](prototype/index.html) をブラウザで開きます。ビルドも依存も要りません。見本アカウントと開き方は [prototype/README.md](prototype/README.md) にあります |

プロトタイプは仕様を確かめるための使い捨てで、本番の実装ではありません。

## 技術スタック

| 区分 | 使うもの |
| --- | --- |
| フロントエンド | React 19 / TypeScript 6 / Vite 8 / Tailwind CSS 4 / React Router 8 / TanStack Query |
| バックエンド | Java 25 / Spring Boot 4 / Spring Security / MyBatis / Flyway |
| データベース | PostgreSQL 18 |
| 開発環境 | Docker Compose（frontend / backend / db の3サービス） |
| 静的解析とテスト | フロントエンド: oxlint・Vitest／バックエンド: Checkstyle・SpotBugs・JUnit |

## 必要なもの

- Docker と Docker Compose v2（`docker compose` コマンド）
- 品質チェックを手で走らせるときだけ、ホストの Node.js（[品質チェック](#品質チェック)）
- ログを読むときだけ、ホストの `jq`（[ログを読む](#ログを読む)）

アプリを動かすだけなら、ホストに Java も Node.js も要りません。

## 起動方法

```bash
docker compose up -d --build
```

初回はイメージのビルドと依存のダウンロードで数分かかります。

| URL | 内容 |
| --- | --- |
| http://localhost:5173 | 画面（frontend）。未ログインならログイン画面に移る。`/api` は backend へ中継される |
| http://localhost:8080/api/health | ヘルスチェック（backend）。DB に届けば 200、届かなければ 503 を返します |

止めるときは `docker compose down` です。データごと消すときは `docker compose down -v` です。`-v` は DB のデータだけでなく、依存とビルド結果のボリュームも消すので、次の起動は依存のダウンロードからやり直しで数分かかります。

## 設定を変える

`.env` が無くてもそのまま起動します。変えたいときだけ、リポジトリ直下に `.env` を作ります（`.env` はコミットしません）。

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `POSTGRES_DB` | `raise_timeline` | データベース名 |
| `POSTGRES_USER` | `raise_timeline` | データベースのユーザー名 |
| `POSTGRES_PASSWORD` | `local-dev-only` | データベースのパスワード |
| `JWT_SECRET` | `bG9jYWwtZGV2LW9ubHktand0LXNlY3JldC0zMi1ieXRlcyE=` | アクセストークンの署名鍵。32 バイト以上のデータを Base64 にした文字列でなければならず、満たさないと backend は起動しない。ローカル専用の値で、本番は別の値を渡す |
| `AUTH_COOKIE_SECURE` | `false` | ログイン用 Cookie に `Secure` を付けるか。ローカルは HTTP なので `false`（`docker-compose.yml` に固定で、`.env` では変えられない）。アプリ本体の既定は `true` |
| `DB_URL_TEST` | `jdbc:postgresql://db:5432/raise_timeline_test` | テストが繋ぐ DB。開発用の DB にテストのデータが混ざらないよう別にしてある（`docker-compose.yml` に固定で、`.env` では変えられない。`POSTGRES_DB` を変えると、それに `_test` が付く） |
| `LOG_LEVEL_APP` | `DEBUG` | アプリのログの水準。`DEBUG` では SQL とその引数も出る。`INFO` にすると本番と同じ行だけになる。変えたら `docker compose up -d` で backend を作り直す |

DB の3つは初回起動時だけ読まれます。変えたら `docker compose down -v` でデータごと作り直してください。依存のボリュームも消えるので、次の起動は数分かかります。

### テスト用の DB

結合テストは、開発用とは別の DB `raise_timeline_test` に繋ぎます。DB の初回起動時（データが空のとき）に、`db/init/` のスクリプトが作ります。

すでに起動したことのある環境では、このスクリプトは走りません。次のコマンドを 1 回だけ手で実行して作ります。

```bash
docker compose exec db psql -U raise_timeline -d raise_timeline -c 'CREATE DATABASE raise_timeline_test OWNER raise_timeline'
```

`docker compose down -v` で作り直す必要はありません。データだけでなく依存のボリュームも消え、次の起動に数分かかるためです。

## 画像の保存（S3）の準備

投稿の画像とアイコンは、Amazon S3 に保存します。ローカルでも本物の S3（開発用バケット）を使うので、人が AWS で次の 4 つを行います。バケットポリシーと IAM ポリシーの JSON は [docs/image-storage-design.md](docs/image-storage-design.md) の 1 章にあります。費用は月に数円〜十数円です。

1. AWS コンソールで開発用バケットを作る。「パブリックアクセスのブロック」のうち、バケットポリシーに関する 2 項目を外し（アカウント単位の設定も同じ）、1 章のバケットポリシー（読み取り用）を付ける
2. 開発用の IAM ユーザーを作り、1 章の IAM ポリシー（書き込み用）を付けて、アクセスキーを発行する
3. リポジトリ直下の `.env` に、次の 5 つの変数を書く（`.env` はコミットしません。アクセスキーは誰にも見せません）
4. `docker compose up -d` で backend を作り直す。`.env` の値は `docker-compose.yml` を通って backend に渡ります

| 変数 | 内容 |
| --- | --- |
| `AWS_REGION` | バケットのリージョン。省略すると東京リージョンになる |
| `S3_BUCKET` | 開発用バケットの名前 |
| `S3_PUBLIC_BASE_URL` | 画像の URL の前半。`S3_PUBLIC_BASE_URL=https://<バケット>.s3.ap-northeast-1.amazonaws.com` の形 |
| `AWS_ACCESS_KEY_ID` | 開発用 IAM ユーザーのアクセスキー ID |
| `AWS_SECRET_ACCESS_KEY` | 同じアクセスキーの秘密鍵 |

設定しなくても、アプリは起動します。そのときは画像を付ける操作（画像付きの投稿、アイコンの変更）だけが 503「画像の保存が設定されていません」になり、ほかの機能は動きます。

画面は、画像を選んだ時点で形式と大きさ（投稿 5 MB、アイコン 2 MB）を調べて止めます。10 MB のような大きすぎる画像を、画面を通さず直接送ると、413 ではなく接続の切断になることがあります（Tomcat の `max-swallow-size` の都合。nginx 越しでは 502）。

## よく使うコマンド

```bash
# backend: 静的解析とテスト
docker compose exec backend ./gradlew check

# frontend: テスト・Lint・型チェック
docker compose exec frontend npm test
docker compose exec frontend npm run lint
docker compose exec frontend npm run typecheck

# DB に入る
docker compose exec db psql -U raise_timeline -d raise_timeline
```

## ログを読む

backend のログは 1 行 1 JSON（ECS 形式）です。項目の意味と決まりは [docs/logging-design.md](docs/logging-design.md) にあります。人が目で読むときは、`jq` で「時刻 レベル メッセージ requestId」の形に整形します。Gradle の出力など JSON でない行は読み飛ばします。

```bash
docker compose logs --no-log-prefix backend --since 10m | jq -R -r 'fromjson? // empty | "\(.["@timestamp"]) \(.log.level) \(.message) \(.http.request.id // "")"'
```

| したいこと | やり方 |
| --- | --- |
| 1 つの要求だけ読む | 上のコマンドの `fromjson? // empty` の後ろに `\| select(.http.request.id == "<requestId>")` を足す |
| ERROR だけ読む | 同じく `\| select(.log.level == "ERROR")` を足す。スタックトレースは `.error.stack_trace` に入っている |
| DEBUG を除いて読む | 同じく `\| select(.log.level != "DEBUG")` を足す。本番で見えるのと同じ行だけになる |
| SQL を出さない | ローカルの既定は DEBUG で、SQL とその引数も出る。止めたいときは `.env` に `LOG_LEVEL_APP=INFO` を書き、`docker compose up -d` で backend を作り直す |

エラー応答の `requestId` と同じ値が、ログの `http.request.id` に入っています。応答で受け取った `requestId` を `<requestId>` に入れれば、その要求の行だけを読めます。

## frontend の依存を足す・変える

```bash
docker compose exec frontend npm install <パッケージ名>
```

`frontend/node_modules`・`backend/build`・`backend/.gradle` はコンテナ用のボリュームのマウント先で、ホストからは root 所有になり書き込めません。ホストで `npm install` しても権限エラーで失敗するので、依存はコンテナの中で足します。

`package-lock.json` が変わったブランチへ切り替えたあとは、引数なしの `docker compose exec frontend npm install` で `node_modules` を合わせます。

## DB のスキーマと SQL

- テーブルの変更は、`backend/src/main/resources/db/migration/` に `V<番号>__<内容>.sql` を足して行います。アプリの起動時に Flyway が当てます。
- **一度当てたマイグレーションは書き換えません。** Flyway が記録したチェックサムと合わなくなり、起動に失敗します。直すときは、次の番号のファイルを足します。
- SQL は `backend/src/main/resources/mapper/` の XML に書きます。Mapper インターフェースは `com.tkmedia.raisetimeline.mapper` に置き、`@Mapper` を付けます（`@MapperScan` は使いません。`@WebMvcTest` などで DB 無しの起動に失敗するためです）。

## 品質チェック

Claude Code から push するときは、hook（`.claude/hooks/guard.cjs`）が `scripts/harness-check.cjs`（ハーネス共通）と `scripts/quality-check.cjs`（このプロジェクト）を自動で走らせ、通らなければ push を止めます。

ターミナルから手で `git push` するときは、何も走りません。CI も静的解析とテストは走らせないので、push の前に、次のコマンドで確かめてください。

```bash
node scripts/quality-check.cjs
```

どちらの場合も、`scripts/quality-check.cjs` はコンテナの中で Gradle と npm を動かすので、コンテナが起動している必要があります。

| 終了コード | 意味 |
| --- | --- |
| 0 | すべての検査が通った |
| 1 | 検査が指摘を出した |
| 3 | 環境の問題で実行できない。Docker が動いていない、コンテナが起動していない、db が healthy でない、git の worktree の中で実行した、検査の途中で docker 自体が失敗した（サマリでは `[環境]` と表示） |

環境の問題は、指摘より優先して 3 を返します。

## task-management と同時に起動できない

task-management と同じポート（5173・8080）を使うので、同時には起動できません。

task-management へ push するときは、その品質チェックが task-management のコンテナを必要とします。こちらを `docker compose down` で止めてから行ってください。

## 開発の進め方

Issue を立て、ブランチを切り、Pull Request で変更を入れます。ルールの正本は `.claude/rules/development-flow.md` です。

機能は 1 Issue ＝ 1 ブランチ ＝ 1 PR とし、[docs/requirements.md](docs/requirements.md) の「6. 実装の順序」に沿って 1 つずつ入れます。

## ディレクトリ構成

| パス | 内容 |
| --- | --- |
| `backend/` | Spring Boot のアプリ |
| `frontend/` | React のアプリ |
| `scripts/` | 品質チェックと、開発の進め方を支える補助（最終レビューの印、計画の管理） |
| `docs/` | 要件定義書と設計書。入口は `docs/README.md` |
| `prototype/` | 仕様確認用のプロトタイプ（HTML / CSS / JavaScript のみ）。開き方は `prototype/README.md` |
| `plans/` | 実装計画の作業メモ。Git では管理せず、紐付いたブランチが消えると一緒に消える |
| `.claude/` | Claude Code のルール・スキル・hook・エージェント定義 |
| `.github/` | CI（ビルドが通るかだけを確かめる）と、Issue・PR のテンプレート |
| `.githooks/` | git のフック。作業ブランチを消したとき、紐付いた計画を `plans/` から片付ける |
| `docker-compose.yml` | ローカル開発用の構成（frontend / backend / db） |

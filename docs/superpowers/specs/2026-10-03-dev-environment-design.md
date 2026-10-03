# raise-timeline 開発環境の設計

- 日付: 2026-10-03

## 目的

新しいアプリを作るための土台を用意します。アプリの中身はまだ決めません。

- `tk-media/raise-timeline` を独立したリポジトリとして作り、GitHub（public）に置く
- ai-harness のルールを適用し、以後の変更を Issue → ブランチ → PR で入れられる状態にする
- task-management と同じ技術スタックで、フロントエンドとバックエンドがローカルで立ち上がる

できあがりの基準は次の2つです。

1. `http://localhost:5173/` を開くと、ダミーページが表示される
2. `http://localhost:8080/` にアクセスすると、DB の疎通を確かめた上で 200 が返る

本番に公開するためのインフラは扱いません。Docker Compose でローカルに立ち上がるところまでです。

## 範囲

### 入れるもの

| | 中身 |
| --- | --- |
| Docker Compose | `frontend` / `backend` / `db` の3サービス |
| frontend | React 19・TypeScript 6・Vite 8・Tailwind CSS 4・React Router 8・Vitest・oxlint。`/` にダミーページ1枚 |
| backend | Java 25・Spring Boot 4・Spring Data JPA・Checkstyle・SpotBugs。`GET /` のヘルスチェック |
| db | PostgreSQL 18。テーブルは作らない |
| push 時の品質チェック | `scripts/quality-check.cjs` |
| CI | `.github/workflows/ci.yml`。ビルドが通ることだけを見る |
| 文書 | `README.md`（起動方法） |

### 入れないもの

| 入れないもの | 理由 |
| --- | --- |
| CloudBeaver | 人の判断で外した。DB の中身は `docker compose exec db psql` で見る |
| `CLAUDE.md` | 人の判断で外した。アプリの中身が決まってから書く |
| `infra/`（Terraform）、本番用の Dockerfile | 本番のインフラは今回の対象外 |
| 学習ドキュメント、学習用のコメント規約、`prototype/`、サンプルデータ、`CONTRIBUTING.md` | task-management 固有のもの。技術スタック以外は合わせない |
| dnd-kit | タスク管理の画面のためのライブラリ |
| フロントからバックエンドを呼ぶ処理（CORS の設定、API クライアント、`VITE_API_BASE_URL`） | ダミーページはバックエンドを呼ばない。最初の API を作るときに足す |
| Actuator、validation | ヘルスチェックは `GET /` が持つ。入力の検証は最初の API を作るときに足す |
| スキーマ管理の方式（`ddl-auto` か Flyway か） | テーブルがまだ無い。最初のテーブルを作るときに決める |
| 開発用プロファイル（`application-dev.properties`） | 開発時だけ変えたい設定がまだ無い |
| DevTools の LiveReload 用ポート（35729） | ブラウザ拡張と組み合わせる機能で、使う予定が無い |

## 段取り

| # | 何をするか | 誰が |
| --- | --- | --- |
| 0 | 中断された前回の試行の残りを消す。Docker のコンテナ4つ・ボリューム6つ・イメージ2つ・ネットワーク1つ（すべて compose プロジェクト `raise-timeline` のもの） | AI |
| 0 | GitHub の `tk-media-code/raise-timeline`（空コミット1つ）を削除する | 人 |
| 1 | `tk-media/raise-timeline` を作り、空コミットを `main` に push する（public） | AI |
| 2 | ハーネスを適用する。`node ai-harness/protect.mjs` → `node ai-harness/install.mjs` | AI |
| 3 | raise-timeline の Issue #1「AI ハーネスを適用する」→ `feature/1-apply-harness` → PR | AI → 人がマージ |
| 4 | ai-harness の Issue「raise-timeline を配布先台帳に載せる」→ PR | AI → 人がマージ |
| 5 | raise-timeline の Issue #2「開発環境を構築する」→ `feature/2-dev-environment` → 実装 → PR | AI → 人がマージ |

- **0 の GitHub 側の削除は人が行います。** AI が使う `gh` のトークンに削除の権限（`delete_repo`）が無いためです。1 の直前に、消えていることを AI が確かめます
- **1 の空コミットだけは `main` へ直接 push します。** リポジトリがまだ無い場所で `git init` からコミット・push までを1コマンドで行う形は、guard が判定の対象から外しています（`guard-core.cjs` の「新しく作る場所を止めないため」）。Issue をまだ作れないので、このコミットに `Closes #` は付きません
- **3 の Issue #1 と 5 の Issue #2 は、3 の時点でまとめて起案します。** 人の承認を得てから作ります。先に2つ作るのは、番号を #1・#2 にそろえるためです
- **3 の PR がマージされてから 5 に入ります。** `feature/2-dev-environment` は、配布物が入った `main` から切ります。4 は 3 のマージを待つ間に出します
- **5 の実装は subagent-driven-development で進めます。** 実装は `implementer`（sonnet）、レビューは `reviewer`（opus）です
- **作業はこのセッション（ai-harness で起動）から行います。** raise-timeline は絶対パスで操作します。guard は、コミットや push の判定を操作先のリポジトリで行います

### 保護の方式

raise-timeline は public なので、GitHub の Ruleset が使えます（Free プランで使えないのは private のリポジトリです）。expense-claim と task-management が同じ方式で運用されています。`protect.mjs` が次を設定します。

- `main` への変更は PR 経由のみ。マージ方式はマージコミットだけ
- force push と `main` の削除を禁止
- マージ後に作業ブランチを自動で消す（`delete_branch_on_merge`）
- ローカルの `core.hooksPath` を `.githooks` に向ける

`install.mjs` が配るのは 98 ファイルです（スキル 79、hook 4、ルール 3、エージェント定義 2 など）。Ruleset が使えるので `.githooks/pre-push` は配られません。

## リポジトリの構成

5 の PR がマージされた時点の姿です。ハーネスの配布物（`.claude/`・`.githooks/`・`plans/`・`scripts/harness-check.cjs` など）は省いています。

```
raise-timeline/
├── .github/workflows/ci.yml
├── .gitignore
├── README.md
├── docker-compose.yml
├── docs/superpowers/specs/2026-10-03-dev-environment-design.md
├── scripts/quality-check.cjs
├── backend/
│   ├── .dockerignore  .gitattributes  .gitignore
│   ├── Dockerfile.dev
│   ├── build.gradle  settings.gradle
│   ├── gradlew  gradlew.bat  gradle/wrapper/
│   ├── config/checkstyle/checkstyle.xml
│   ├── config/spotbugs/exclude.xml
│   └── src/
│       ├── main/java/com/tkmedia/raisetimeline/
│       │   ├── RaiseTimelineApplication.java
│       │   └── controller/HealthCheckController.java
│       ├── main/resources/application.properties
│       └── test/java/com/tkmedia/raisetimeline/
│           ├── RaiseTimelineApplicationTests.java
│           └── controller/HealthCheckControllerTest.java
└── frontend/
    ├── .dockerignore  .gitignore  .oxlintrc.json
    ├── Dockerfile.dev
    ├── index.html
    ├── package.json  package-lock.json
    ├── tsconfig.json  tsconfig.app.json  tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx  App.tsx  App.test.tsx  index.css
        ├── pages/HomePage.tsx
        └── test/setup.ts
```

## 作り方の方針

**task-management の設定ファイルを写し、タスク管理固有の部分を落とします。** バージョンは task-management が固定しているものにそろえます。

| | バージョン |
| --- | --- |
| Docker イメージ | `node:24`、`eclipse-temurin:25-jdk`、`postgres:18` |
| backend | Spring Boot 4.1.0、Gradle 9.5.1（ラッパー）、Checkstyle 13.9.0、SpotBugs 4.10.3（プラグイン 6.5.10） |
| frontend | React 19.2.8、React Router 8.3.0、Vite 8.1.5、TypeScript 6.0.3、Tailwind CSS 4.3.3、Vitest 4.1.11、oxlint 1.76.0 |

- **frontend の依存は、task-management の `package.json` と `package-lock.json` を写し、dnd-kit の3つを外します。** `package-lock.json` からは dnd-kit の分だけを落とします（`npm install --package-lock-only`）。残りの依存は、ロックされたバージョンのまま残ります（使い捨てのコンテナで実測済み）
- **そのうえで `npm audit fix` を当てます。** task-management のロックのままだと、`npm audit` が既知の脆弱性を 4 件報告します（Vitest、jsdom が使う undici、PostCSS が使う nanoid）。どれも開発用の道具の中にあり、配るコードには入りませんが、0 件で始めます。変わるのは 12 パッケージで、Vitest が 4.1.10 → 4.1.11、ほかは間接依存のパッチ・マイナー更新です。上の表の、それ以外の版は変わりません
- **Gradle ラッパー（`gradlew`・`gradlew.bat`・`gradle/wrapper/`）はそのまま写します。** プロジェクトに依存しないファイルです
- **コメントは「なぜそうしているか」が自明でない箇所にだけ書きます。** 学習用の解説と、存在しない文書への参照は写しません

採らなかった案は、公式の雛形（Spring Initializr、create-vite）から作り直すことです。雛形はその時点の最新版になるので、task-management と同じバージョンにならず、設定の移し替えも要ります。

## 各部品

### Docker Compose

| サービス | イメージ | 中身 | ホストに公開 |
| --- | --- | --- | --- |
| `frontend` | `frontend/Dockerfile.dev` | Vite の開発サーバー（`npm run dev`） | 5173 |
| `backend` | `backend/Dockerfile.dev` | `./gradlew -t classes` と `./gradlew bootRun` を並走させる | 8080 |
| `db` | `postgres:18` | `pg_isready` のヘルスチェック付き | しない |

- コンテナ名は `raise-timeline-frontend`・`raise-timeline-backend`・`raise-timeline-db` に固定します。品質チェックが `docker exec` で名指しするためです
- `backend` は `db` が healthy になってから起動します
- `frontend` はソースをマウントし、`node_modules` だけ名前付きボリュームに置きます。`backend` は Gradle のキャッシュとビルド成果物を名前付きボリュームに置きます。どちらも task-management と同じ作りです
- **ポートは task-management と同じ 5173・8080 です。** 人の判断で、番号をずらさないことにしました。task-management とは同時に起動できません

### DB の接続情報（task-management と変えるところ）

**`.env` を必須にしません。** ローカル専用の既定値を `docker-compose.yml` に書き、`docker compose up` だけで起動するようにします。

| 変数 | 既定値 |
| --- | --- |
| `POSTGRES_DB` | `raise_timeline` |
| `POSTGRES_USER` | `raise_timeline` |
| `POSTGRES_PASSWORD` | `local-dev-only` |

値を変えたいときだけ、リポジトリ直下に `.env` を作って上書きします。`.env` は `.gitignore` に入れます。`.env.example` は置かず、変えられる変数は README に書きます。

理由は、作者のグローバル設定（`~/.claude/settings.json`）が `.env.*` の読み取りを拒否していて、AI が `.env.example` を読めないためです。AI が保守できない雛形を置くより、読める `docker-compose.yml` に寄せます。DB のポートはホストに公開しないので、既定のパスワードが載っていても外から届きません。

採らなかった案は、task-management と同じ「`.env.example` を写して `.env` を作る」形です。手順が1つ増え、上の理由で AI が雛形を確かめられません。

### frontend

- **ダミーページ**（`src/pages/HomePage.tsx`）: 見出し `raise-timeline` と、「開発環境の構築が完了しました。ここからアプリを作っていきます。」の一文。Tailwind のクラスで体裁を付けます
- **ルーティング**: `main.tsx` で `BrowserRouter` を掛け、`App.tsx` に `/` のルートを1つだけ定義します
- **`index.html`**: `lang="ja"`、タイトルは `raise-timeline`
- **npm のスクリプト**:

  | スクリプト | 中身 |
  | --- | --- |
  | `dev` | `vite` |
  | `build` | `tsc -b && vite build` |
  | `typecheck` | `tsc -b` |
  | `test` | `vitest run` |
  | `lint` | `oxlint --deny-warnings` |

- **`lint` に `--deny-warnings` を付けます。** oxlint は警告だけだと終了コード 0 を返し、品質チェックを素通りするためです（oxlint 1.76.0 で実測済み。`debugger` を1行書くと、フラグなしは 0、フラグありは 1 を返しました。実装時にも同じ違反を作って確かめます）
- **設定ファイル**（`vite.config.ts`・`tsconfig*.json`・`.oxlintrc.json`）は task-management のものを写します

### backend

- **パッケージ**: `com.tkmedia.raisetimeline`。起動クラスは `RaiseTimelineApplication`
- **依存**: `spring-boot-starter-webmvc`、`spring-boot-starter-data-jpa`、`postgresql`、`spring-boot-devtools`（開発時のみ）。テスト用に `spring-boot-starter-webmvc-test` と `junit-platform-launcher`
- **静的解析**: Checkstyle と SpotBugs の設定は task-management のものを写します。SpotBugs の除外（`EI_EXPOSE_REP`・`EI_EXPOSE_REP2`）も残します。Spring がコンストラクタで渡す部品をフィールドに持つ、というふつうの書き方がこの指摘に当たるためです
- **テストが失敗したときは、理由（期待した値と実際の値）まで出力させます**（`build.gradle` の `testLogging`）。push 時の品質チェックの出力が、そのまま直す材料になるためです。task-management には無い設定です

#### `GET /` のヘルスチェック

`HealthCheckController` が、`JdbcTemplate` で `SELECT 1` を投げて結果を返します。

| 状態 | ステータス | 本文 |
| --- | --- | --- |
| DB に問い合わせが通る | 200 | `{"status":"UP","database":"UP"}` |
| DB に届かない、または問い合わせに失敗する | 503 | `{"status":"DOWN","database":"DOWN"}` |

- **失敗の原因は本文に載せません。** 内部の構成を外に出さないためです。ログに WARN で残します
- **DB に届かないときは、約5秒で 503 を返します。** 接続プール（HikariCP）の接続待ちの上限は既定で 30 秒で、何も設定しないと応答まで 30 秒かかります（中断された試行が実測で 30.01 秒）。`spring.datasource.hikari.connection-timeout=5000` を設定します
- この設定はアプリ全体の接続プールに効きます。プールが埋まったときの待ち時間も 5 秒になります。個人で使う規模なので、問題にしません

#### `application.properties`

| 設定 | 値 | 理由 |
| --- | --- | --- |
| `spring.application.name` | `raise-timeline` | |
| `spring.datasource.url` / `username` / `password` | 環境変数 `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | 値は compose が渡す |
| `spring.datasource.hikari.connection-timeout` | `5000` | 上の「約5秒で 503」のため |
| `spring.jpa.open-in-view` | `false` | 既定の `true` は起動時に警告が出る。トランザクションの外での遅延読み込みを、黙って成功させない |

## 品質チェック

### push 時（`scripts/quality-check.cjs`）

ハーネスの hook が、共通チェック（`scripts/harness-check.cjs`）の次に走らせます。起動中のコンテナの中で、次を**全部**走らせてから結果をまとめます。1つ落ちても残りを走らせるのは、1回の push で指摘を出し切るためです。

| 対象 | コマンド | 見るもの |
| --- | --- | --- |
| backend | `./gradlew check --console=plain` | コンパイル・Checkstyle・SpotBugs・テスト |
| frontend | `npm run lint` | oxlint |
| frontend | `npm run typecheck` | 型 |
| frontend | `npm test` | Vitest |

終了コードはハーネスの規約どおりです。

| コード | 意味 | こうなるとき |
| --- | --- | --- |
| 0 | 合格 | |
| 1 | 指摘あり | 上のどれかが失敗した |
| 3 | 環境の問題で実行できない | `docker` を実行できない／3つのコンテナのどれかが起動していない／`db` が healthy でない／git の worktree の中から実行した |

- **Node で書きます。** 作者が Windows 機も使っているためです（`writing-quality-checks` スキルの「迷ったら Node」）
- **worktree の中からは検査しません。** コンテナがマウントしているのはメインの作業ディレクトリなので、worktree から走らせると、変更していない側のコードを検査して合格させてしまいます
- **frontend は `npm run build` ではなく `npm run typecheck` を回します。** コンテナは root で動くので、コンテナ内でビルドすると、ホスト側に root 所有の `frontend/dist/` が残り、あとで消せなくなります。ビルドが通るかは CI が見ます

### CI（`.github/workflows/ci.yml`）

`main` への PR と、`main` への push で走ります。task-management と同じ2ジョブです。

| ジョブ | コマンド |
| --- | --- |
| backend | `./gradlew assemble testClasses --console=plain`（JDK 25） |
| frontend | `npm ci` → `npm run build`（Node 24） |

テストと静的解析は CI では走らせません。それらは push 時の品質チェックが受け持ちます。CI の役割は、手元の環境に依存せず、まっさらな環境でビルドが通ることの確認です。

## テスト

実装はテストを先に書いて進めます（test-driven-development）。

| テスト | 何を確かめるか | DB |
| --- | --- | --- |
| `HealthCheckControllerTest` | `JdbcTemplate` を偽物に差し替え、問い合わせが通れば 200、例外なら 503 が返ること | 要らない |
| `RaiseTimelineApplicationTests` | アプリ全体を起動し、本物の DB に対して `GET /` が 200 を返すこと | 要る（コンテナ内で実行） |
| `App.test.tsx` | `/` を開くと、ダミーページの見出しが描画されること | — |

設定ファイル（compose・Dockerfile・CI）はテストを書けないので、下の完了条件で実際に動かして確かめます。

## 完了条件

1. `docker compose up -d --build` で3つとも起動し、`db` が healthy になる
2. `http://localhost:5173/` が 200 を返し、実際のブラウザでダミーページが表示される。コンソールにエラーが無い
3. `http://localhost:8080/` が 200 と `{"status":"UP","database":"UP"}` を返す。`db` を止めると約5秒で 503 になり、起動し直すと 200 に戻る
4. `node scripts/quality-check.cjs` が 0 を返す。わざと lint 違反・テスト失敗・コンテナ停止を作ると、それぞれ 1・1・3 が返る
5. push 時に hook が共通チェックと品質チェックを通す
6. PR の CI が2ジョブとも緑になる
7. 起動と検査のあと、`git status` に何も出ない（コンテナが作るものは、名前付きボリュームか `.gitignore` 済みの場所に収まる）

## 決めたこと（人の判断）

| 論点 | 決定 | 採らなかった案 |
| --- | --- | --- |
| 前回の試行が残したリポジトリ | 作り直す | 空コミット1つのリポジトリを再利用する |
| `GET /` が確かめる範囲 | DB の疎通まで | 起動していれば 200 を返す／`/actuator/health` に任せる |
| ホストのポート | task-management と同じ 5173・8080 | 5174・8081 にずらす／`.env` で変えられるようにする |
| Issue と PR の切り方 | ハーネスの適用と環境構築を分ける | 1本にまとめる |
| 土台に入れるもの | 品質チェックと CI は入れる。CloudBeaver と `CLAUDE.md` は入れない | 4つとも入れる |
| `npm audit` が報告する既知の脆弱性 4 件 | `npm audit fix` を当てて 0 件で始める | task-management と完全に同じ版のままにする |

ポートを同じにした結果、task-management のコンテナと同時には起動できません。task-management へ push するときは、その品質チェックが task-management のコンテナを必要とするので、raise-timeline を止めてから行います。README に書いておきます。

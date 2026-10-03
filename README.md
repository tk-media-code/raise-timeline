# raise-timeline

新しいアプリを作るための土台です。アプリの中身はこれから作ります。今あるのは、ダミーページと、DB の疎通を確かめるヘルスチェックだけです。

## 技術スタック

| 区分 | 使うもの |
| --- | --- |
| フロントエンド | React 19 / TypeScript 6 / Vite 8 / Tailwind CSS 4 / React Router 8 |
| バックエンド | Java 25 / Spring Boot 4 / Spring Data JPA |
| データベース | PostgreSQL 18 |
| 開発環境 | Docker Compose（frontend / backend / db の3サービス） |
| 静的解析とテスト | フロントエンド: oxlint・Vitest／バックエンド: Checkstyle・SpotBugs・JUnit |

## 必要なもの

- Docker と Docker Compose v2（`docker compose` コマンド）
- 品質チェックを手で走らせるときだけ、ホストの Node.js（[品質チェック](#品質チェック)）

アプリを動かすだけなら、ホストに Java も Node.js も要りません。

## 起動方法

```bash
docker compose up -d --build
```

初回はイメージのビルドと依存のダウンロードで数分かかります。

| URL | 内容 |
| --- | --- |
| http://localhost:5173 | ダミーページ（frontend） |
| http://localhost:8080 | ヘルスチェック（backend）。DB に届けば 200、届かなければ 503 を返します |

止めるときは `docker compose down` です。データごと消すときは `docker compose down -v` です。`-v` は DB のデータだけでなく、依存とビルド結果のボリュームも消すので、次の起動は依存のダウンロードからやり直しで数分かかります。

## 設定を変える

`.env` が無くてもそのまま起動します。変えたいときだけ、リポジトリ直下に `.env` を作ります（`.env` はコミットしません）。

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `POSTGRES_DB` | `raise_timeline` | データベース名 |
| `POSTGRES_USER` | `raise_timeline` | データベースのユーザー名 |
| `POSTGRES_PASSWORD` | `local-dev-only` | データベースのパスワード |

DB の3つは初回起動時だけ読まれます。変えたら `docker compose down -v` でデータごと作り直してください。依存のボリュームも消えるので、次の起動は数分かかります。

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

## frontend の依存を足す・変える

```bash
docker compose exec frontend npm install <パッケージ名>
```

`frontend/node_modules`・`backend/build`・`backend/.gradle` はコンテナ用のボリュームのマウント先で、ホストからは root 所有になり書き込めません。ホストで `npm install` しても権限エラーで失敗するので、依存はコンテナの中で足します。

`package-lock.json` が変わったブランチへ切り替えたあとは、引数なしの `docker compose exec frontend npm install` で `node_modules` を合わせます。

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

## ディレクトリ構成

| パス | 内容 |
| --- | --- |
| `backend/` | Spring Boot のアプリ |
| `frontend/` | React のアプリ |
| `scripts/` | 品質チェック |
| `docs/` | 設計書 |
| `docker-compose.yml` | ローカル開発用の構成（frontend / backend / db） |

# 永続化を Flyway＋MyBatis にする設計

- 日付: 2026-10-05

## 目的

バックエンドの永続化の土台を、まだ何も載っていない今のうちに決めます。

- DB のマイグレーションは **Flyway** で行う
- OR マッパーは **MyBatis** を使う。Spring Data JPA はやめる

開発環境の設計（[2026-10-03-dev-environment-design.md](2026-10-03-dev-environment-design.md)）では、
スキーマ管理の方式を「最初のテーブルを作るときに決める」として先送りしていました。今回それを決めます。

### 今の状態

- `spring-boot-starter-data-jpa` を依存に持っているが、エンティティもリポジトリも無く、JPA は使われていない
- DB に触っているのは `HealthCheckController` が `JdbcTemplate` で投げる `SELECT 1` だけ
- テーブルは無い

## 範囲

**土台の差し替えだけを行い、テーブルは作りません。** Flyway と MyBatis を入れて、それぞれが実際に動くことを
確かめるところまでです。最初のテーブルは、アプリの中身が決まったときに足します。

## 依存（`backend/build.gradle`）

| 外す | 入れる |
| --- | --- |
| `spring-boot-starter-data-jpa` | `org.mybatis.spring.boot:mybatis-spring-boot-starter:4.1.0` |
| | `org.springframework.boot:spring-boot-starter-flyway` |
| | `org.flywaydb:flyway-database-postgresql` |

- **MyBatis のスターターはバージョンを明記します。** Spring Boot の依存管理に含まれていないためです。4.1.0 は
  Spring Boot 4.1.0 向けに作られた版です（Maven Central の POM で確認済み）
- **Flyway の2つはバージョンを書きません。** Spring Boot 4.1.0 が管理しています（Flyway 12.4.0）
- **`flyway-database-postgresql` が要ります。** Flyway 10 以降、PostgreSQL への対応が本体から別の部品に分かれたためです
- MyBatis のスターターが `spring-boot-starter-jdbc` を連れてくるので、接続プール（HikariCP）と
  `spring.datasource.hikari.connection-timeout=5000` はそのまま効きます
- テスト用の `mybatis-spring-boot-starter-test` は入れません。今回の Mapper は結合テストで確かめれば足ります

## Flyway

- マイグレーションの置き場所は既定の `src/main/resources/db/migration/` です
- **今回はマイグレーションのファイルを置きません。** ディレクトリを残すために `.gitkeep` だけを置きます
- 最初のテーブルを作るときに `V1__<内容>.sql` を足します
- アプリの起動時に Flyway が走り、`flyway_schema_history` テーブルを作ります。既存の開発用 DB は空なので、
  `docker compose down -v` で作り直さなくても動きます
- **マイグレーションが1つも無いときにも `flyway_schema_history` が作られることは、まだ実測していません。**
  実装の最初に確かめます。作られなかった場合は、Flyway が走ったことの確かめ方をこの設計に戻って決め直します

## MyBatis

### 規約

- **SQL は XML に統一します。** `src/main/resources/mapper/` 配下に置き、Java 側には Mapper のインターフェースだけを置きます
  - 条件によって組み立てが変わる SQL（`<if>` / `<foreach>`）も同じ書き方で読める
  - SQL を探す場所が1つに決まる
- **Mapper は `@Mapper` で見つけさせます。** `@MapperScan` は使いません。起動クラスに `@MapperScan` を付けると、
  `@WebMvcTest` のような一部だけを起動するテストでも Mapper を作りにいき、失敗するためです
- Mapper のインターフェースは `com.tkmedia.raisetimeline.mapper` パッケージに置きます

### `application.properties`

| 設定 | 値 | 理由 |
| --- | --- | --- |
| `spring.jpa.open-in-view` | （消す） | JPA をやめるため |
| `mybatis.mapper-locations` | `classpath:mapper/**/*.xml` | 上の規約の置き場所から XML を読む |
| `mybatis.configuration.map-underscore-to-camel-case` | `true` | DB の `snake_case` の列名を、Java の `camelCase` のプロパティに対応させる |

### ヘルスチェックを MyBatis 経由にする

| ファイル | 中身 |
| --- | --- |
| `mapper/HealthCheckMapper.java` | `@Mapper` を付けたインターフェース。`SELECT 1` の結果を返すメソッドを1つ持つ |
| `resources/mapper/HealthCheckMapper.xml` | `SELECT 1` |
| `controller/HealthCheckController.java` | `JdbcTemplate` ではなく `HealthCheckMapper` を呼ぶ |

- **応答は変えません。**

  | 状態 | ステータス | 本文 |
  | --- | --- | --- |
  | DB に問い合わせが通る | 200 | `{"status":"UP","database":"UP"}` |
  | DB に届かない、または問い合わせに失敗する | 503 | `{"status":"DOWN","database":"DOWN"}` |

- 失敗の原因は本文に載せず、ログに WARN で残します（今と同じ）
- MyBatis が投げる例外は、MyBatis-Spring が Spring の `DataAccessException` に変換します。今の
  `catch (DataAccessException e)` がそのまま効きます

## 文書

| ファイル | 変更 |
| --- | --- |
| `README.md` | 技術スタックの「Spring Data JPA」を「MyBatis / Flyway」に直す。マイグレーションの置き場所と、SQL の書き場所の規約を短く書く |
| `backend/config/spotbugs/exclude.xml` | 除外の理由のうち「JPA エンティティの関連」を消す |
| `docs/superpowers/specs/2026-10-03-dev-environment-design.md` | **書き換えない。** その時点で何を決めたかの記録なので、この設計書から参照するにとどめる |

## テスト

実装はテストを先に書いて進めます（test-driven-development）。

| テスト | 何を確かめるか | DB |
| --- | --- | --- |
| `HealthCheckControllerTest` | `HealthCheckMapper` を偽物に差し替え、問い合わせが通れば 200、例外なら 503 が返ること。本文のキーが2つだけであること | 要らない |
| `RaiseTimelineApplicationTests` | アプリ全体を起動し、本物の DB に対して `GET /` が 200 を返すこと（MyBatis が XML を読み込んで動いていること） | 要る（コンテナ内で実行） |
| `RaiseTimelineApplicationTests` | `flyway_schema_history` テーブルがあること（起動時に Flyway が走ったこと） | 要る（コンテナ内で実行） |

DB に届かないときに約5秒で 503 を返すことは、テストでは確かめられません。下の完了条件で実際に確かめます。

## 完了条件

1. `build.gradle` に JPA の依存が無く、`application.properties` に `spring.jpa.*` の設定が無い
2. `docker compose up -d --build` で backend が起動し、ログに Flyway が走った記録が出る
3. `docker compose exec db psql` で `flyway_schema_history` テーブルがあることを確かめられる
4. `http://localhost:8080/` が 200 と `{"status":"UP","database":"UP"}` を返す。`db` を止めると約5秒で 503 になり、起動し直すと 200 に戻る
5. push 時に hook が共通チェックと品質チェックを通す
6. PR の CI が2ジョブとも緑になる

## 決めたこと（人の判断）

| 論点 | 決定 | 採らなかった案 |
| --- | --- | --- |
| 今回の範囲 | 土台の差し替えだけ。テーブルは作らない | 最初のテーブルも一緒に作る |
| SQL の書き場所 | XML に統一する | アノテーションに統一する／単純なものはアノテーション、複雑なものは XML と使い分ける |

## 採らなかった案

| 案 | 採らなかった理由 |
| --- | --- |
| ヘルスチェックは `JdbcTemplate` のままにする | 今 DB に触っているのはヘルスチェックだけなので、これを MyBatis 経由にしないと、最初の機能を作るまで MyBatis が動くかどうかを誰も確かめられない |
| 中身の無い `V1__init.sql` を置いて、Flyway が動くことを見せる | テーブルは作らないと決めたので、意味の無いバージョン1が履歴に残るだけになる |
| `@MapperScan` で Mapper を一括で見つけさせる | `@WebMvcTest` などのスライステストでも Mapper を作りにいき、失敗する |

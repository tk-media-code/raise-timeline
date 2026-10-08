# 認証認可設計

- 日付: 2026-10-06

## 1. 方針

- 認証は JWT による。**有効期限 1 時間のアクセストークン**と、**有効期限 30 日のリフレッシュトークン**を併用する
- アクセストークンは JS のメモリにだけ置き、API 呼び出しの `Authorization: Bearer` ヘッダーで送る
- リフレッシュトークンは httpOnly Cookie に置き、`/api/auth` 配下の API にだけ送られる（使うのは更新とログアウト）。サーバーはハッシュを DB に持ち、ログアウトで無効にできる
- サーバーはセッションを持たない（ステートレス）。EC2 を増やしても設計は変わらない
- すべての画面と API はログインが要る。例外は登録・ログイン・更新・ログアウト・ヘルスチェックだけ

## 2. トークンの仕様

| | アクセストークン | リフレッシュトークン |
| --- | --- | --- |
| 形式 | JWT（HS256 で署名） | 256 ビットの乱数を Base64URL にした文字列。JWT ではない |
| 中身 | `sub`（ユーザー id）、`iat`、`exp`、`iss`（`raise-timeline`） | 意味のある中身は無い |
| 有効期限 | 発行から 1 時間 | 発行から 30 日 |
| 置き場所 | ブラウザの JS のメモリ | httpOnly Cookie |
| 送り方 | `Authorization: Bearer <token>` | ブラウザが Cookie として自動で送る |
| サーバー側の保存 | しない。署名を検証するだけ | `refresh_tokens` に SHA-256 のハッシュを保存する。トークンそのものは保存しない |
| 無効化 | できない（1 時間で切れる） | 行を消せば即座に無効 |
| 使うたび | 変わらない | 新しいものに差し替える（ローテーション）。古いものは消す |

Cookie の属性は次のとおり。

```
Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=2592000
```

- `HttpOnly`: JS から読めない。XSS で盗めない
- `Secure`: HTTPS でしか送らない。既定で付ける（設定値 `auth.cookie-secure` の既定は true）。ローカルだけ `docker-compose.yml` が `AUTH_COOKIE_SECURE=false` を渡して外す。Safari は `http://localhost` で `Secure` の Cookie を受け付けないという報告があるため。ローカルで実際に確かめる
- `SameSite=Lax`: 他のサイトからの POST には付かない。更新とログアウトを他サイトから呼ばせない
- `Path=/api/auth`: `/api/auth` 配下（登録・ログイン・更新・ログアウト）にしか送られない。他の API に毎回付いて回らない

署名鍵（`JWT_SECRET`）は 256 ビット以上の乱数で、環境変数から読む。鍵を変えると発行済みのアクセストークンはすべて無効になる（最長 1 時間で復帰する）。

## 3. 流れ

### 登録とログイン

```mermaid
sequenceDiagram
    participant B as ブラウザ
    participant A as API
    participant DB
    B->>A: POST /api/auth/login { email, password }
    A->>DB: lower(email) でユーザーを引く
    A->>A: BCrypt でパスワードを照合（失敗なら 401 INVALID_CREDENTIALS）
    A->>A: アクセストークンを発行（1 時間）
    A->>A: リフレッシュトークンを生成（乱数）
    A->>DB: refresh_tokens にハッシュと期限（30 日）を保存
    A-->>B: 200 { accessToken, user } ＋ Set-Cookie: refresh_token
    B->>B: accessToken をメモリに置く
```

登録（`POST /api/auth/register`）は、ユーザーを作ったあと同じ手順でトークンを返す。登録した瞬間からログイン済みになる。

### API の呼び出しと、期限切れのときの更新

```mermaid
sequenceDiagram
    participant B as ブラウザ
    participant A as API
    B->>A: GET /api/timeline/all（Authorization: Bearer ...）
    A-->>B: 401 UNAUTHENTICATED（期限切れ）
    B->>A: POST /api/auth/refresh（Cookie: refresh_token）
    A-->>B: 200 { accessToken, user } ＋ 新しい Cookie
    B->>A: GET /api/timeline/all（新しい Bearer）
    A-->>B: 200
```

- 更新を試すのは 401 `UNAUTHENTICATED` のときだけ。ログイン失敗の 401 `INVALID_CREDENTIALS` では試さない
- 401 のときに更新を試すのは **1 回だけ**。更新も 401 なら、ログアウト状態にしてログイン画面へ移す
- 更新の要求は、同じタブの中では 1 本にまとめる（進行中の更新があればそれを待つ）。起動時の更新も API クライアントの更新も、同じ関数を通す。開発中は React の StrictMode で effect が 2 回走るので、まとめていないと起動のたびに 2 本出る
- タブの間では Web Locks API（`navigator.locks.request('auth-refresh', ...)`）で順番に並べる。ブラウザの再起動でタブが復元されたときや、複数のタブを同時にリロードしたときに、同じ Cookie で更新が 2 本出ると、使い捨てのリフレッシュトークンの片方が 401 になるため。後のタブは前のタブが受け取った新しい Cookie で成功する

### 更新（サーバー側）

```mermaid
sequenceDiagram
    participant B as ブラウザ
    participant A as API
    participant DB
    B->>A: POST /api/auth/refresh（Cookie: refresh_token）
    A->>DB: DELETE ... WHERE token_hash = ? AND expires_at > now() RETURNING user_id（引くと消すを 1 文で）
    alt 行が無い（無効、期限切れ、使用済み）
        A-->>B: 401 INVALID_REFRESH_TOKEN（Cookie は消さない）
    else 有効
        A->>DB: 新しいハッシュと期限で行を入れる。その人の期限切れの行も消す
        A-->>B: 200 { accessToken, user } ＋ 新しい Cookie
    end
```

引くことと消すことを 1 文で行うのは、同時に 2 本の更新が来ても片方しか成功しないようにするため。別々の文にすると両方が成功し、有効なトークンが 2 本できる。401 のときに Cookie を消さないのは、同時に出たもう 1 本が受け取った新しい Cookie を、遅れて届いた 401 の応答で消してしまわないため。無効な Cookie は期限が来れば消える。

### 画面の起動時

```mermaid
flowchart TD
    S[アプリの起動。メモリにトークンは無い] --> R[POST /api/auth/refresh]
    R -->|200| OK[accessToken をメモリに置き、ログイン済みとして描画]
    R -->|401| NG[未ログインとして描画。保護された画面なら /login へ移す]
```

リロード・URL の直接入力・タブの開き直しのたびに、この 1 往復が入る。画面内の移動（React Router）ではメモリが保たれるので入らない。
往復の間は読み込み中の表示を出す。

### ログアウト

（退会の流れは [features/auth.md](features/auth.md) の 4 章。パスワードを照合し、`users` の行を消し、Cookie を消す）

1. 画面で確認ダイアログを出す
2. `POST /api/auth/logout`（Cookie）。サーバーは該当の `refresh_tokens` の行を消し、Cookie を消す応答を返す
3. 画面はメモリのアクセストークンと利用者の情報を捨て、`/login` へ移す

アクセストークンは残り最長 1 時間有効だが、ブラウザから捨てているので使われない。

## 4. パスワード

- 保存は BCrypt（Spring Security の `BCryptPasswordEncoder`、強度は既定の 10）
- 入力は 8〜72 文字の、空白を含まない ASCII の印字可能文字（0x21〜0x7E）。BCrypt が 72 バイトまでしか見ないため、バイト数と文字数が一致する範囲に限る
- ログイン失敗の応答は「メールアドレスまたはパスワードが違います」の 1 種類。メールアドレスの有無を教えない
- ログイン・登録・退会（`DELETE /api/users/me`）は nginx で 1 IP あたり毎分 20 回（バースト 20）に制限する（本番のみ。ローカルの Vite には無い。[architecture.md](architecture.md)）
- パスワードはログに出さない。要求本文はログに書かない（[logging-design.md](logging-design.md) の 5 章）
- ログインで該当するメールアドレスが無いときも、ダミーのハッシュと照合してから 401 を返す。照合を飛ばすと応答時間の差でメールアドレスの有無が分かる
- 登録の 409 `EMAIL_TAKEN` で、そのメールアドレスが登録済みかは分かる。メール確認を入れない以上これは避けられないので、受け入れる
- ログインの成功と失敗、投稿とコメントの削除、退会は、出来事として残す。残す値とレベルは [logging-design.md](logging-design.md) の 3 章が正本

## 5. 公開 API と認可の規則

### 認証なしで呼べる API

| API | 理由 |
| --- | --- |
| `POST /api/auth/register` | 登録 |
| `POST /api/auth/login` | ログイン |
| `POST /api/auth/refresh` | Cookie で認証する |
| `POST /api/auth/logout` | Cookie で特定する。トークンが無くても 204 |
| `GET /api/health` | ALB のヘルスチェック |

それ以外の `/api/**` はすべて有効なアクセストークンが要る。無ければ 401 `UNAUTHENTICATED`。

### 認可の規則

| 操作 | 許す人 | それ以外 |
| --- | --- | --- |
| 投稿の編集・削除 | 投稿した本人 | 403 |
| コメントの削除 | 書いた本人 | 403 |
| プロフィールの更新、アイコンの更新 | 本人（`/api/users/me` なので他人を指定できない） | — |
| いいね・フォローの付け外し | 自分として行う操作のみ（URL に相手を指定し、主体はトークンの利用者） | — |
| 退会 | 本人（`/api/users/me`）。パスワードの再入力が要る | — |
| 閲覧（タイムライン、プロフィール、一覧、検索） | ログイン済みなら誰でも | 401 |

判定は、サービス層で「資源の持ち主の id」と「トークンの `sub`」を比べて行う。存在しない資源は 404、存在するが他人のものは 403。
役割（管理者など）は無い。全員が同じ権限を持つ。

## 6. バックエンドの構成（Spring Security）

| 項目 | 内容 |
| --- | --- |
| セッション | `STATELESS`。`JSESSIONID` を発行しない |
| JWT の検証 | `spring-boot-starter-security-oauth2-resource-server`（Spring Boot 4 で `spring-boot-starter-oauth2-resource-server` から改名された）の `NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256)` を使う。`iss` の検証は既定では行われないので、`JwtValidators.createDefaultWithIssuer("raise-timeline")` を設定する。`Authorization: Bearer` を自動で読み、`sub` を認証情報にする |
| JWT の発行 | 同じ依存に含まれる `NimbusJwtEncoder`。鍵は `ImmutableSecret` で渡す。既定は RS256 なので、発行時に `JwsHeader.with(MacAlgorithm.HS256)` を指定する。追加の JWT ライブラリは入れない |
| Bearer を読まない範囲 | `/api/auth/` で始まるパスでは `Authorization: Bearer` を読まない（`BearerTokenResolver` を差し替える）。この配下は Cookie か本文で認証する口なので、期限切れのアクセストークンがヘッダーに付いたままでも、先に検証されて 401 にならず、更新とログアウトが動く。画面も Bearer を付けないが、サーバー側でも守る |
| 401 と 403 の応答 | `AuthenticationEntryPoint` と `AccessDeniedHandler` を差し替え、Problem Details の形で返す（[error-handling-design.md](error-handling-design.md)） |
| CSRF 対策 | Spring Security の CSRF トークンは無効にする。状態を変える API は Bearer ヘッダーで認証し、Cookie だけで動くのは更新とログアウトのみ。その 2 つは `SameSite=Lax` で他サイトからの POST を防ぎ、応答（アクセストークン）も他サイトからは読めない |
| パスワード | `BCryptPasswordEncoder` |
| リフレッシュトークンの生成 | `SecureRandom` で 32 バイト → Base64URL。保存は SHA-256 の 16 進文字列。更新は `DELETE ... RETURNING` の 1 文で引いて消す |
| 期限切れの掃除 | 更新時に、その利用者の期限切れの行をついでに消す。定期の掃除は入れない |
| ログイン中の利用者 | コントローラは `@AuthenticationPrincipal` で `sub` を受け取る。サービス層には利用者 id を引数で渡す |
| テスト | `spring-boot-starter-security-test`（`@WithMockUser` と `jwt()` の RequestPostProcessor）を test の依存に足す |
| 同時の登録 | 同じユーザー名やメールアドレスが同時に来たら、一意制約の違反を制約名で見分けて 409 に変換する |
| 退会した利用者のトークン | アクセストークンは退会後も最長 1 時間は署名が有効なので、認証のたびに `users` に利用者が存在するかを主キーで確かめ、無ければ 401 `UNAUTHENTICATED` にする（`OAuth2TokenValidator<Jwt>` で `sub` の存在を見る）。1 要求につき主キーの検索が 1 回増えるが、この規模では問題にしない |

## 7. フロントの認証状態

| 項目 | 内容 |
| --- | --- |
| 状態の置き場 | React の Context（`AuthProvider`）。`accessToken`、`user`、`status`（`loading` / `authenticated` / `anonymous`）を持つ |
| 起動時 | `AuthProvider` が、API クライアントと同じ「更新を 1 本にまとめる関数」で `POST /api/auth/refresh` を 1 回呼ぶ。終わるまで `loading` |
| 保護された画面 | `status` が `anonymous` なら（自分でログアウトした直後を除き）`/login?next=<元のパス>` へ移す。ログイン後に `next` へ戻す。`next` は `/` で始まり、`//` と `/\` で始まらず、制御文字（タブ・改行）を含まない値だけを受け付ける（外部サイトへ飛ばされないため。ブラウザは URL のタブと改行を取り除くので、`/<タブ>/evil.example` は `//evil.example` になる）。それ以外は `/` へ |
| ログイン済みで `/login` `/register` | `next` があれば（`safeNext` を通して）そこへ、無ければ `/` へ移す。ログイン後・登録後の移動もこの仕組みが担う。ログイン画面は状態を更新するだけで自分では移動しない（両方が移動すると、後から走るほうが前の移動を上書きして `next` に戻れなくなるため） |
| API クライアント | `fetch` を包む 1 つの関数。Bearer を付ける。ただし認証の 4 つの API（登録・ログイン・更新・ログアウト）には Bearer を付けず、401 でも更新してやり直さない（本文か Cookie で認証する口で、期限切れのトークンを付けると 401 になりログアウトできなくなるため）。401 `UNAUTHENTICATED` なら更新を 1 回試してやり直す。更新は同じタブでは 1 本だけ（進行中の Promise を共有する）、タブの間では Web Locks API で順番に並べる |
| ログアウト | API を呼んでから状態を捨て、TanStack Query のキャッシュも消す（他人のデータを残さない）。自分でログアウトしたあとは `next` を付けずに `/login` へ移す（付けると、次にログインした人が前の人の画面に着くため）。セッションの期限切れや、URL の直接入力・リロードで未ログインと分かったときは `/login?next=…` へ移す |
| 描画の例外 | `ErrorBoundary` が受け止め、「問題が起きました。再読み込みしてください」の画面を出す |

## 8. 設定値

| 設定 | 値 | 置き場 |
| --- | --- | --- |
| `JWT_SECRET` | 256 ビット以上の乱数（Base64） | ローカルは `docker-compose.yml` のローカル専用の値（`.env` で上書きできる）、本番は SSM Parameter Store |
| アクセストークンの有効期限 | 1 時間 | `application.properties` |
| リフレッシュトークンの有効期限 | 30 日 | `application.properties` |
| Cookie 名 | `refresh_token` | `application.properties` |
| `auth.cookie-secure` | 既定 true。ローカルは compose が false を渡す | `application.properties`（ローカルは `docker-compose.yml` の環境変数） |

## 9. 採らなかった案

| 案 | 採らなかった理由 |
| --- | --- |
| アクセストークンだけ（有効期限 7 日、localStorage） | 実装は少ないが、サーバー側でログアウトできず、盗まれると 7 日間使われる |
| アクセストークンを localStorage に置く | 起動時の 1 往復が要らなくなるが、XSS でトークンを読み出して持ち去られる。メモリでも、XSS が起きればその場で更新 API を呼んでアクセストークンを得られるので無傷ではないが、持ち去れないのはリフレッシュトークンで、被害は最長 1 時間に限られる |
| アクセストークンも httpOnly Cookie に置く | 全 API が Cookie 認証になり、CSRF 対策が全面的に要る。JWT を Bearer で送る形を学ぶ目的にも合わない |
| JWT ライブラリ（jjwt など）を足す | Spring Security の標準部品で発行も検証もできる。依存を増やさない |
| リフレッシュトークンの再利用検知（古いトークンが使われたら全部無効化） | 守りは強くなるが実装が増える。将来の課題にする |

## 10. 将来の課題

- リフレッシュトークンの再利用検知
- パスワードの変更・再設定（メール送信の仕組みが要る）
- メール確認

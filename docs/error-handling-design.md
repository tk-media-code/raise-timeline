# エラーハンドリング設計

- 日付: 2026-10-06

## 1. API のエラー応答の形式

HTTP の標準である RFC 9457「Problem Details」に従う。Spring Boot が標準で対応している（`ProblemDetail`）ので、追加の部品は要らない。
すべてのエラーがこの 1 つの形で返り、`Content-Type` は `application/problem+json`。

```json
{
  "type": "about:blank",
  "title": "入力内容に誤りがあります",
  "status": 422,
  "detail": "本文は 280 文字以内で入力してください",
  "instance": "/api/posts",
  "code": "VALIDATION_ERROR",
  "errors": [ { "field": "body", "message": "280 文字以内で入力してください" } ],
  "requestId": "a1b2c3d4e5f6"
}
```

| 項目 | 内容 |
| --- | --- |
| `type` `title` `status` `detail` `instance` | RFC 9457 の標準項目。`type` は `about:blank` に固定し、分類は `code` で行う |
| `code` | 画面が処理を分岐するための固定の文字列（下の分類表） |
| `errors` | 入力項目ごとの誤り。検証エラー（422）と重複（409）のときだけ付く。`field` は要求の JSON のキー名または multipart の部品名 |
| `requestId` | ログと突き合わせるための ID。応答ヘッダー `X-Request-Id` と同じ |

`title` と `detail` は人が読む日本語。画面はそのまま表示してよい。

## 2. 分類表

| ステータス | code | 起きる場面 | detail の例 |
| --- | --- | --- | --- |
| 400 | `BAD_REQUEST` | JSON が壊れている、cursor の形式が不正、multipart に必要な部品が無い | 要求の形式が正しくありません |
| 401 | `UNAUTHENTICATED` | アクセストークンが無い・期限切れ・改ざん | ログインが必要です |
| 401 | `INVALID_CREDENTIALS` | ログインのメールアドレスかパスワードが違う。どちらが違うかは言わない | メールアドレスまたはパスワードが違います |
| 401 | `INVALID_REFRESH_TOKEN` | リフレッシュトークンが無い・期限切れ・ログアウト済み | ログインの有効期限が切れました |
| 403 | `FORBIDDEN` | 他人の投稿・コメントを変えようとした | この操作はできません |
| 404 | `NOT_FOUND` | ユーザー・投稿・コメントが無い。存在しない URL | 見つかりません |
| 409 | `USERNAME_TAKEN` | ユーザー名の重複。`errors` に `username` | このユーザー名は使われています |
| 409 | `EMAIL_TAKEN` | メールアドレスの重複。`errors` に `email` | このメールアドレスは登録済みです |
| 413 | `FILE_TOO_LARGE` | 画像が上限（投稿 5 MB、アイコン 2 MB）を超える | 画像は 5 MB 以内にしてください |
| 415 | `UNSUPPORTED_IMAGE_TYPE` | JPEG / PNG / GIF / WebP 以外。中身の先頭バイトで判定 | JPEG、PNG、GIF、WebP の画像を選んでください |
| 422 | `VALIDATION_ERROR` | 文字数・必須・形式の誤り、画像 5 枚以上、本文も画像も無い投稿、自分自身のフォロー | 入力内容に誤りがあります（`errors` に項目ごとの文言） |
| 429 | （nginx が返す。本文は Problem Details ではない） | ログイン・登録の回数制限 | — |
| 500 | `INTERNAL_ERROR` | 想定外の例外 | 問題が起きました。時間をおいて再試行してください |
| 503 | （ヘルスチェックのみ。本文は `{"status":"DOWN","database":"DOWN"}`） | DB に届かない | — |

## 3. バックエンドの実装方針

### 例外の変換

- 例外の変換は `@RestControllerAdvice` の 1 クラス（`ApiExceptionHandler`）に集める。`ResponseEntityExceptionHandler` を継承し、Spring が投げる例外（JSON の構文エラー、`@Valid` の失敗、multipart の超過など）も同じ形にする
- 業務の例外はサービス層が投げる。`NotFoundException`（404）、`ForbiddenException`（403）、`ConflictException`（409、どの項目かを持つ）、`InvalidCredentialsException`（401）、`InvalidRefreshTokenException`（401）、`UnsupportedImageTypeException`（415）
- Spring Security の 401 と 403 は、例外ハンドラに届く前に止まる。`AuthenticationEntryPoint` と `AccessDeniedHandler` を差し替えて、同じ Problem Details を書き出す
- 存在しない URL（`NoResourceFoundException`）は 404 `NOT_FOUND` にする
- 想定外の例外（`Exception`）は 500 `INTERNAL_ERROR`。`detail` は固定文言

### 入力検証

- JSON の入力は Bean Validation（`@Valid` と `@NotBlank` `@Size` `@Pattern` `@Email`）で検証し、`MethodArgumentNotValidException` を 422 に変換する。`errors` には項目ごとの文言を日本語で入れる
- 文字数は Unicode のコードポイント数で数える。標準の `@Size` は UTF-16 の単位で数えるので、コードポイントで数える独自の検証（`@CodePointSize`）を作る
- 画像の枚数・大きさ・形式は、アップロードの処理で検査する。大きさの超過は Spring が `MaxUploadSizeExceededException` を投げるので 413 に変換する
- テーブルをまたぐ規則（本文も画像も無い投稿は不可、自分自身のフォロー不可）はサービス層で検証し、422 を投げる

### 本文に載せないもの

例外のメッセージ、SQL、スタックトレース、内部のパス、接続先。これらはログにだけ残す。`detail` はあらかじめ決めた文言だけを使う。

### ログ

| 水準 | 対象 | 内容 |
| --- | --- | --- |
| ERROR | 500 | スタックトレース付き |
| WARN | 503、S3 の削除失敗、想定外だが継続できた事象 | 要点と原因 |
| INFO | 4xx | メソッド、パス、ステータス、code。本文は書かない |
| DEBUG | 開発時のみ | SQL など |

- すべてのログ行に `requestId` を付ける。`OncePerRequestFilter` が要求ヘッダー `X-Request-Id`（本番は nginx が `$request_id` で付ける）を読み、無ければ生成して MDC に入れる。応答ヘッダーにも返す
- パスワードとトークンはログに出さない

### トランザクションと外部サービス

- サービス層のメソッドに `@Transactional` を付け、DB の書き込みを 1 つの単位にする。例外が出れば巻き戻る
- 画像付き投稿: 先に S3 へ上げ、DB の書き込みが失敗したら上げた画像を消してからエラーを返す（補償）。S3 への保存が途中で失敗したら、それまでに上げた分を消して 500 を返す
- 投稿の削除: DB を消してから S3 を消す。S3 側の失敗はログ（WARN）に残し、応答は成功（204）にする。残った孤児の画像は利用者には見えない。掃除は将来の課題
- アイコンの差し替え: 新しい画像を上げ、DB を更新してから古い画像を消す。古い画像の削除の失敗は WARN

## 4. 画面での扱い

### API クライアント

- `fetch` を包む 1 つの関数が、エラー応答を `ApiError { status, code, detail, errors, requestId }` に変換して投げる。本文が Problem Details でないとき（nginx の 429、通信失敗）は `code` を `null` にし、`status` だけで判断する
- 401 `UNAUTHENTICATED` は、この関数の中で更新を 1 回試してやり直す（[auth-design.md](auth-design.md)）。画面の側には届かない

### 状況ごとの動き

| 状況 | 画面の動き |
| --- | --- |
| 401（更新も失敗） | ログアウト状態にしてログイン画面へ移る。ログイン後に元の画面へ戻す |
| 403 | 通知で「この操作はできません」。画面の状態は変えない |
| 404（画面そのものの読み込み） | 投稿詳細やプロフィールなら「見つかりません」の画面 |
| 404（操作） | 通知で伝え、一覧を読み直す（消された投稿へのいいねなど） |
| 409 / 422 | `errors` を入力欄の下に項目ごとに表示する。項目に紐付かないものはフォームの上部に `detail` を表示する。入力中の内容は消さない |
| 413 / 415 | ファイル選択の時点で画面側でも同じ検査（拡張子と大きさ）をして先に伝える。すり抜けた場合は `detail` を表示する |
| 429 | 「しばらく待ってから再試行してください」 |
| 500 | 通知で `detail` を表示する。入力中の内容は消さない |
| 通信失敗（応答なし） | 「通信に失敗しました」。一覧なら「再試行」ボタンを出す |
| 楽観的更新の失敗（いいね、フォロー） | 見た目を元に戻し、通知で伝える |
| 描画そのものの例外 | React の ErrorBoundary で「問題が起きました。再読み込みしてください」の画面を出す |
| 存在しない URL | 「ページが見つかりません」の画面とホームへのリンク |

### 画面側の検証

- 文字数・必須・形式の検査を入力中に行い、送信前に伝える。規則はサーバーと同じ値にする（[features/](features/) の各文書）
- 最終判断はサーバー。画面の検証は体験のためで、安全のためではない

### 文言

- 日本語で、「何が悪いか」と「どうすればよいか」を書く。「280 文字以内で入力してください」「画像は 4 枚までです」
- 謝罪や曖昧な表現（「エラーが発生しました」だけ）は使わない
- サーバーの `title` と `detail` も同じ基準で書く。画面はそれをそのまま使ってよい

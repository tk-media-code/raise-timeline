-- リフレッシュトークンに、更新に使った時刻を足す。NULL はまだ使っていない。
-- 使ってから猶予（auth.refresh-token-grace）の間だけ、同じトークンでの更新を受け付ける。
-- 一度当てたファイルは書き換えない。直すときは次の番号のファイルで直す。

ALTER TABLE refresh_tokens ADD COLUMN used_at timestamptz;

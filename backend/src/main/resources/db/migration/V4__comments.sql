-- コメント。列・型・既定値は docs/database-design.md のとおり。
-- 一度当てたファイルは書き換えない。直すときは次の番号のファイルで直す。

CREATE TABLE comments (
    id         uuid         PRIMARY KEY DEFAULT uuidv7(),
    -- 外部キーには名前を付けず、既定の comments_post_id_fkey・comments_user_id_fkey にする（V2__posts.sql と同じ方針）。
    -- サービスはこの名前で「投稿が消えた」「書いた人が消えた」ことを見分けるので、名前を付け替えない。
    post_id    uuid         NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- 280 コードポイントまで。varchar(n) は文字数（コードポイント）で数えるので、絵文字も 1 文字になる。
    -- 空は許さない。画面と API の検査をすり抜けたときの最後の守りでもある。
    body       varchar(280) NOT NULL CHECK (length(body) >= 1),
    created_at timestamptz  NOT NULL DEFAULT now()
);

-- PostgreSQL は外部キーに索引を自動で付けない。投稿ごとのコメント一覧（新しい順）に使う。
CREATE INDEX comments_post_id_id_idx ON comments (post_id, id);
-- 退会で users の行を消すとき、連鎖削除でその人の行を探すのに使う。
CREATE INDEX comments_user_id_idx ON comments (user_id);

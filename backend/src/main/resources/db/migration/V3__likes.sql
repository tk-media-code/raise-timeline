-- いいね。列・型・既定値は docs/database-design.md のとおり。
-- 一度当てたファイルは書き換えない。直すときは次の番号のファイルで直す。

CREATE TABLE likes (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    -- 外部キーには名前を付けず、既定の likes_post_id_fkey・likes_user_id_fkey にする（V2__posts.sql と同じ方針）。
    -- サービスはこの名前で「投稿が消えた」「付けた人が消えた」ことを見分けるので、名前を付け替えない。
    post_id    uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- 同じ人が同じ投稿に付けられるのは 1 回だけ。「自分が付けたか」「投稿の数」の検索にも使う。
    CONSTRAINT likes_post_id_user_id_key UNIQUE (post_id, user_id)
);

-- PostgreSQL は外部キーに索引を自動で付けない。いいねした人の一覧（新しい順）に使う。
CREATE INDEX likes_post_id_id_idx ON likes (post_id, id);
-- 退会で users の行を消すとき、連鎖削除でその人の行を探すのに使う。
CREATE INDEX likes_user_id_idx ON likes (user_id);

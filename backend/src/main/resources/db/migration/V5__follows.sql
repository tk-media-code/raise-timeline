-- フォロー関係。列・型・既定値は docs/database-design.md のとおり。
-- 一度当てたファイルは書き換えない。直すときは次の番号のファイルで直す。

CREATE TABLE follows (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    -- 外部キーには名前を付けず、既定の follows_follower_id_fkey・follows_followee_id_fkey にする（V2__posts.sql と同じ方針）。
    -- サービスはこの名前で「フォローされる側が消えた」「フォローする側が消えた」ことを見分けるので、名前を付け替えない。
    follower_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    followee_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    -- 同じ人を 2 回フォローできるようにしない。「自分がフォローしているか」の検索にも使う。
    CONSTRAINT follows_follower_id_followee_id_key UNIQUE (follower_id, followee_id),
    -- 自分自身をフォローしない。サービスが先に 422 にするので、これは API をすり抜けたときの最後の守り。
    CHECK (follower_id <> followee_id)
);

-- PostgreSQL は外部キーに索引を自動で付けない。フォロワーの一覧（新しい順）に使う。
CREATE INDEX follows_followee_id_id_idx ON follows (followee_id, id);
-- フォロー中の一覧（新しい順）に使う。退会で users の行を消すとき、連鎖削除でその人がフォローしている行を探すのにも使う。
CREATE INDEX follows_follower_id_id_idx ON follows (follower_id, id);

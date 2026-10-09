-- 投稿と投稿画像。列・型・既定値は docs/database-design.md のとおり。
-- 一度当てたファイルは書き換えない。直すときは次の番号のファイルで直す。
-- post_images は画像の Issue で使うが、database-design.md に「画像の Issue では DB を変えない」とあるので、ここで一緒に作る。

CREATE TABLE posts (
    id         uuid         PRIMARY KEY DEFAULT uuidv7(),
    -- 外部キーには名前を付けず、既定の posts_user_id_fkey にする（database-design.md 1 章の方針 9）。
    -- サービスはこの名前で「投稿者が消えた」ことを見分けるので、名前を付け替えない。
    user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- 280 コードポイントまで。varchar(n) は文字数（コードポイント）で数えるので、絵文字も 1 文字になる。
    -- 空は許す（画像だけの投稿）。画面と API の検査をすり抜けたときの最後の守りでもある。
    body       varchar(280) NOT NULL DEFAULT '',
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);

-- PostgreSQL は外部キーに索引を自動で付けない。利用者ごとの投稿一覧（新しい順）に使う。
CREATE INDEX posts_user_id_id_idx ON posts (user_id, id);

CREATE TABLE post_images (
    id         uuid     PRIMARY KEY DEFAULT uuidv7(),
    post_id    uuid     NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    object_key text     NOT NULL,
    -- 1 つの投稿に付けられる画像は 4 枚まで。表示の順を position で持つ。
    position   smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
    CONSTRAINT post_images_post_id_position_key UNIQUE (post_id, position)
);

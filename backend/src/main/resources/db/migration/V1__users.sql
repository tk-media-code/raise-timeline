-- 利用者とリフレッシュトークン。列・型・既定値は docs/database-design.md の 3 章のとおり。
-- 一度当てたファイルは書き換えない。直すときは次の番号のファイルで直す。

CREATE TABLE users (
    id            uuid         PRIMARY KEY DEFAULT uuidv7(),
    username      varchar(20)  NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
    display_name  varchar(50)  NOT NULL,
    email         varchar(254) NOT NULL,
    password_hash text         NOT NULL,
    bio           varchar(160) NOT NULL DEFAULT '',
    avatar_key    text,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- 利用者名とメールアドレスは大文字小文字を区別せずに一意にする。
-- 制約ではなく一意索引にしているのは、式（lower）に対する UNIQUE 制約は書けないため。
-- 名前は例外ハンドラが DuplicateKeyException の文言から見分けるので、変えない。
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE refresh_tokens (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    -- 外部キーには名前を付けず、既定の refresh_tokens_user_id_fkey にする（database-design.md 1 章の方針 9）。
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text        NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

-- PostgreSQL は外部キーに索引を自動で付けない。更新のときに、その人の期限切れの行をついでに消すために使う。
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

package com.tkmedia.raisetimeline.domain;

import java.util.UUID;

/** 投稿 1 件のコメント数。コメントが 1 件以上ある投稿だけが問い合わせの結果に出る。 */
public record CommentCount(UUID postId, long count) {
}

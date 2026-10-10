package com.tkmedia.raisetimeline.domain;

import java.util.UUID;

/** 投稿 1 件のいいね数。いいねが 1 件以上ある投稿だけが問い合わせの結果に出る。 */
public record LikeCount(UUID postId, long count) {
}

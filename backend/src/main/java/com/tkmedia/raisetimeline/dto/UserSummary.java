package com.tkmedia.raisetimeline.dto;

import java.util.UUID;

/** 投稿の投稿者など、一覧の中に載せる利用者の最小限の情報。 */
public record UserSummary(UUID id, String username, String displayName, String avatarUrl) {
}

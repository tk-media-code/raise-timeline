package com.tkmedia.raisetimeline.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** コメント 1 件の応答。書いた人は {@link UserSummary}（{@code email} などは載せない）。 */
public record CommentResponse(UUID id, UserSummary author, String body, OffsetDateTime createdAt) {
}

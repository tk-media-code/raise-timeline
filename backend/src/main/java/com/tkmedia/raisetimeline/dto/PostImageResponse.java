package com.tkmedia.raisetimeline.dto;

import java.util.UUID;

/** 投稿に付いた画像 1 枚。画像の扱いは Issue 5 で足す。 */
public record PostImageResponse(UUID id, String url) {
}

package com.tkmedia.raisetimeline.dto;

import java.util.UUID;

/** 投稿に付いた画像 1 枚。{@code url} は保存先の公開 URL で、並びは表示の順（position の昇順）。 */
public record PostImageResponse(UUID id, String url) {
}

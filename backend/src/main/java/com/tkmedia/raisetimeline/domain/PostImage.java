package com.tkmedia.raisetimeline.domain;

import java.util.UUID;

/**
 * 投稿に付いた画像 1 枚の行（{@code post_images}）。{@code objectKey} は保存先のキーで、URL ではない
 * （URL は保存先の設定で変わるので、応答を作るときに {@code ImageStorage.urlOf} で作る）。
 * {@code position} は表示の順で、0 から 3。
 */
public record PostImage(UUID id, UUID postId, String objectKey, int position) {
}

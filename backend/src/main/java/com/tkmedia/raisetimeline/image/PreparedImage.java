package com.tkmedia.raisetimeline.image;

/**
 * 検査を通り、保存してよい状態になった画像。JPEG は位置情報を取り除いた後の中身が入る。
 *
 * @param content 保存する中身
 * @param type 中身から判定した形式
 */
public record PreparedImage(byte[] content, ImageType type) {
}

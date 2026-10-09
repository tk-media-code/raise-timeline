package com.tkmedia.raisetimeline.image;

/**
 * JPEG の中身を解析できなかったときに投げる。位置情報を消せないまま保存すると撮影地が漏れるので、
 * 呼び出し側は保存せずに 422 にする。
 *
 * <p>{@code ApiException} にしないのは、この部品が項目名（{@code images} か {@code avatar}）を知らないため。
 * 項目名を知っている {@link ImageUploadRules} が検証の失敗に変える。
 */
public class UnreadableImageException extends Exception {

	private static final long serialVersionUID = 1L;

	public UnreadableImageException(Throwable cause) {
		// 画像の中身は、ログにも例外の文言にも出さない。原因の例外だけを持つ。
		super("画像を解析できなかった", cause);
	}

}

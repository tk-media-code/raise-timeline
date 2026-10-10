package com.tkmedia.raisetimeline.image;

import java.util.Optional;

/**
 * 先頭のバイト（マジックナンバー）で画像の形式を判定する。ファイル名や申告された {@code Content-Type} は見ない。
 * 利用者が自由に偽れる値で形式を決めると、SVG などをアップロードできてしまうため。
 *
 * <p>WebP は {@code RIFF} で始まるだけでは足りない。同じ入れ物を使う WAV などと区別するため、
 * 8〜11 バイト目の {@code WEBP} まで見る。
 */
public final class ImageTypeDetector {

	private static final byte[] JPEG_HEAD = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
	private static final byte[] PNG_HEAD = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
	private static final byte[] GIF87A_HEAD = {'G', 'I', 'F', '8', '7', 'a'};
	private static final byte[] GIF89A_HEAD = {'G', 'I', 'F', '8', '9', 'a'};
	private static final byte[] RIFF_HEAD = {'R', 'I', 'F', 'F'};
	private static final byte[] WEBP_TAG = {'W', 'E', 'B', 'P'};
	private static final int WEBP_TAG_OFFSET = 8;

	private ImageTypeDetector() {
	}

	/** 形式が分かれば返し、受け付けない中身（空・SVG・テキストなど）なら空を返す。 */
	public static Optional<ImageType> detect(byte[] content) {
		if (startsWith(content, 0, JPEG_HEAD)) {
			return Optional.of(ImageType.JPEG);
		}
		if (startsWith(content, 0, PNG_HEAD)) {
			return Optional.of(ImageType.PNG);
		}
		if (startsWith(content, 0, GIF87A_HEAD) || startsWith(content, 0, GIF89A_HEAD)) {
			return Optional.of(ImageType.GIF);
		}
		if (startsWith(content, 0, RIFF_HEAD) && startsWith(content, WEBP_TAG_OFFSET, WEBP_TAG)) {
			return Optional.of(ImageType.WEBP);
		}
		return Optional.empty();
	}

	/** {@code content} の {@code offset} 以降が {@code prefix} で始まるか。足りない長さは一致しない扱い。 */
	private static boolean startsWith(byte[] content, int offset, byte[] prefix) {
		if (content.length < offset + prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if (content[offset + i] != prefix[i]) {
				return false;
			}
		}
		return true;
	}

}

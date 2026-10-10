package com.tkmedia.raisetimeline.image;

/**
 * 受け付ける画像の形式。拡張子と {@code Content-Type} は、申告された値ではなく、
 * 中身から判定したこの形式から決める（{@link ImageTypeDetector}）。
 */
public enum ImageType {

	JPEG("jpg", "image/jpeg"),
	PNG("png", "image/png"),
	GIF("gif", "image/gif"),
	WEBP("webp", "image/webp");

	private final String extension;
	private final String contentType;

	ImageType(String extension, String contentType) {
		this.extension = extension;
		this.contentType = contentType;
	}

	/** オブジェクトキーの末尾に付ける拡張子（ドットなし）。 */
	public String extension() {
		return extension;
	}

	public String contentType() {
		return contentType;
	}

}

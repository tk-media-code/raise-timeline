package com.tkmedia.raisetimeline.error;

/** 送られたファイルの中身が JPEG・PNG・GIF・WebP のどれでもないときに投げる。415 になる。 */
public class UnsupportedImageTypeException extends ApiException {

	private static final long serialVersionUID = 1L;

	public UnsupportedImageTypeException() {
		super(ErrorCode.UNSUPPORTED_IMAGE_TYPE);
	}

}

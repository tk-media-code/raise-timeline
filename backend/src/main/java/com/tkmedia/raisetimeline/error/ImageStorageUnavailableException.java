package com.tkmedia.raisetimeline.error;

/** 画像の保存先（S3）が設定されていない環境で、画像を送られたときに投げる。503 になる。 */
public class ImageStorageUnavailableException extends ApiException {

	private static final long serialVersionUID = 1L;

	public ImageStorageUnavailableException() {
		super(ErrorCode.IMAGE_STORAGE_UNAVAILABLE);
	}

}

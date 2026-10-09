package com.tkmedia.raisetimeline.error;

/** 送られた画像が、投稿用 5 MB・アイコン用 2 MB の上限を超えたときに投げる。413 になる。 */
public class FileTooLargeException extends ApiException {

	private static final long serialVersionUID = 1L;

	public FileTooLargeException() {
		super(ErrorCode.FILE_TOO_LARGE);
	}

}

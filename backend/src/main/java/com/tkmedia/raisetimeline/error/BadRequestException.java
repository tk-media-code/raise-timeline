package com.tkmedia.raisetimeline.error;

/** 要求の形が正しくないときに投げる。400 になる。Spring が拒む型変換の失敗と同じ応答にそろえる。 */
public class BadRequestException extends ApiException {

	private static final long serialVersionUID = 1L;

	public BadRequestException() {
		super(ErrorCode.BAD_REQUEST);
	}

}

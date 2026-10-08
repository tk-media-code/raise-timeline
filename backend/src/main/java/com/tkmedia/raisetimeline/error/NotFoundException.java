package com.tkmedia.raisetimeline.error;

/** 対象が無い、または見せてはいけない（存在を隠す）ときに投げる。404 になる。 */
public class NotFoundException extends ApiException {

	private static final long serialVersionUID = 1L;

	public NotFoundException() {
		super(ErrorCode.NOT_FOUND);
	}

}

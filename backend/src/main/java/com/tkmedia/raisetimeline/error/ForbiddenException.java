package com.tkmedia.raisetimeline.error;

/** ログインしているが、その操作は許されないときに投げる。403 になる。 */
public class ForbiddenException extends ApiException {

	private static final long serialVersionUID = 1L;

	public ForbiddenException() {
		super(ErrorCode.FORBIDDEN);
	}

}

package com.tkmedia.raisetimeline.error;

import java.util.List;

/** 登録済みの値と重なったときに投げる。409 になり、errors に重なった項目を 1 件入れる。 */
public class ConflictException extends ApiException {

	private static final long serialVersionUID = 1L;

	public ConflictException(ErrorCode code, String field) {
		super(code, List.of(new FieldError(field, code.message())));
	}

}

package com.tkmedia.raisetimeline.error;

import java.util.List;

/** 入力の検証に失敗したときに投げる。422 になり、項目ごとの誤りを errors に入れる。 */
public class ValidationException extends ApiException {

	private static final long serialVersionUID = 1L;

	public ValidationException(List<FieldError> errors) {
		super(ErrorCode.VALIDATION_ERROR, errors);
	}

}

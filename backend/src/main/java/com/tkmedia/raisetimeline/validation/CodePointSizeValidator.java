package com.tkmedia.raisetimeline.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class CodePointSizeValidator implements ConstraintValidator<CodePointSize, CharSequence> {

	private int min;
	private int max;

	@Override
	public void initialize(CodePointSize annotation) {
		this.min = annotation.min();
		this.max = annotation.max();
	}

	@Override
	public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
		if (value == null) {
			return true;
		}
		int count = value.toString().codePointCount(0, value.length());
		return min <= count && count <= max;
	}

}

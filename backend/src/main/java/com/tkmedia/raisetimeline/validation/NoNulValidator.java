package com.tkmedia.raisetimeline.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class NoNulValidator implements ConstraintValidator<NoNul, CharSequence> {

	@Override
	public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
		return value == null || value.toString().indexOf('\u0000') < 0;
	}

}

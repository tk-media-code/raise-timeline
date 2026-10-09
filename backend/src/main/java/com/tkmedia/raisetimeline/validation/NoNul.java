package com.tkmedia.raisetimeline.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 文字列に NUL（U+0000）を含めない。
 *
 * <p>PostgreSQL は NUL を含む文字列を保存できず、通すと 500 になる。文字列を受け取る入力（JSON の DTO・
 * multipart のテキスト・クエリの文字列）のすべてに付ける。{@code null} は通す。
 */
@Documented
@Constraint(validatedBy = NoNulValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD, ElementType.ANNOTATION_TYPE,
		ElementType.TYPE_USE })
@Retention(RetentionPolicy.RUNTIME)
public @interface NoNul {

	String message() default "使えない文字が含まれています";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}

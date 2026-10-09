package com.tkmedia.raisetimeline.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 文字列の長さを Unicode のコードポイント数で検証する。
 *
 * <p>標準の {@code @Size} は UTF-16 の単位で数えるので、絵文字などの補助文字が 2 文字に数えられる。
 * 利用者が「1 文字」と見る単位に揃えるため、{@link String#codePointCount} で数える。{@code null} は通す
 * （必須かどうかは {@code @NotBlank} が決める）。
 */
@Documented
@Constraint(validatedBy = CodePointSizeValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD, ElementType.ANNOTATION_TYPE,
		ElementType.TYPE_USE })
@Retention(RetentionPolicy.RUNTIME)
public @interface CodePointSize {

	String message() default "文字数が正しくありません";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	int min() default 0;

	int max() default Integer.MAX_VALUE;

}

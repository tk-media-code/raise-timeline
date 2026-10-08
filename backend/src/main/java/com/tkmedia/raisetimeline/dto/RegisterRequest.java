package com.tkmedia.raisetimeline.dto;

import com.tkmedia.raisetimeline.validation.CodePointSize;
import com.tkmedia.raisetimeline.validation.NoNul;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 新規登録の入力。すべての注釈に {@code message} を書くのは、書かないと Hibernate Validator の既定の文言
 * （「空白は許可されていません」など）が応答の {@code errors} に出るため。
 */
public record RegisterRequest(
		@NotBlank(message = "3〜20 文字の英数字と _ で入力してください")
		@Pattern(regexp = "^[A-Za-z0-9_]{3,20}$", message = "3〜20 文字の英数字と _ で入力してください")
		@NoNul
		String username,
		@NotBlank(message = "1〜50 文字で入力してください")
		@CodePointSize(min = 1, max = 50, message = "1〜50 文字で入力してください")
		@NoNul
		String displayName,
		@NotBlank(message = "メールアドレスの形式で入力してください")
		@Email(message = "メールアドレスの形式で入力してください")
		@Size(max = 254, message = "メールアドレスの形式で入力してください")
		@NoNul
		String email,
		@NotBlank(message = "8〜72 文字の半角英数字と記号で入力してください")
		@Pattern(regexp = "^[\\x21-\\x7E]{8,72}$", message = "8〜72 文字の半角英数字と記号で入力してください")
		@NoNul
		String password) {

	/** 表示名は前後の Unicode の空白を除く。{@code trim()} は NUL も消すので使わない（NUL は検証で弾く）。 */
	public RegisterRequest {
		if (displayName != null) {
			displayName = displayName.strip();
		}
	}

}

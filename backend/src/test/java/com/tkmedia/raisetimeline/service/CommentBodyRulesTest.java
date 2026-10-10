package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ValidationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class CommentBodyRulesTest {

	private static final String UNUSABLE = "使えない文字が含まれています";
	private static final String TOO_SHORT_OR_LONG = "1〜280 文字で入力してください";

	private static void assertRejected(String raw, String message) {
		assertThatThrownBy(() -> CommentBodyRules.validate(raw))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).containsExactly(new FieldError("body", message)));
	}

	@Test
	@DisplayName("1 文字は通る")
	void oneCharacterPasses() {
		assertThat(CommentBodyRules.validate("あ")).isEqualTo("あ");
	}

	@ParameterizedTest(name = "[{index}]")
	@NullSource
	@ValueSource(strings = { "", " ", "   ", "　", "　 　", "\n", "\r\n", "  \n　" })
	@DisplayName("null・空・半角空白・全角空白（U+3000）・改行だけは 1〜280 文字で入力してください")
	void blankIsRejected(String raw) {
		assertRejected(raw, TOO_SHORT_OR_LONG);
	}

	@Test
	@DisplayName("280 文字は通り、281 文字は 1〜280 文字で入力してください。絵文字は 1 文字と数える")
	void lengthBoundary() {
		assertThat(CommentBodyRules.validate("あ".repeat(280))).isEqualTo("あ".repeat(280));
		assertThat(CommentBodyRules.validate("😀".repeat(280))).isEqualTo("😀".repeat(280));

		assertRejected("あ".repeat(281), TOO_SHORT_OR_LONG);
		assertRejected("😀".repeat(281), TOO_SHORT_OR_LONG);
	}

	@Test
	@DisplayName("CRLF を LF に直してから数え、直した値を返す")
	void crlfIsNormalizedBeforeCounting() {
		String raw = "あ".repeat(139) + "\r\n" + "い".repeat(140);

		assertThat(CommentBodyRules.validate(raw)).isEqualTo("あ".repeat(139) + "\n" + "い".repeat(140));
	}

	@ParameterizedTest(name = "[{index}]")
	@ValueSource(strings = { "a\u0000b", "\u0000", "a\uD800b", "a\uDC00", "\uD83D" })
	@DisplayName("NUL と対になっていないサロゲートは 使えない文字が含まれています")
	void unusableCharsAreRejected(String raw) {
		assertRejected(raw, UNUSABLE);
	}

	@Test
	@DisplayName("使えない文字は、空白だけの本文の判定より先に見つかる")
	void unusableCharsComeBeforeBlankCheck() {
		assertRejected("\u0000 ", UNUSABLE);
	}

	@Test
	@DisplayName("前後の空白は残す")
	void surroundingWhitespaceIsKept() {
		assertThat(CommentBodyRules.validate(" a ")).isEqualTo(" a ");
	}

}

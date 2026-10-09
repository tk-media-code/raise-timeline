package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ValidationException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PostBodyRulesTest {

	private static final String UNUSABLE = "使えない文字が含まれています";
	private static final String TOO_LONG = "280 文字以内で入力してください";
	private static final String EMPTY = "本文か画像を入れてください";

	private static void assertRejected(String raw, boolean hasImages, String message) {
		assertThatThrownBy(() -> PostBodyRules.validate(raw, hasImages))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).containsExactly(new FieldError("body", message)));
	}

	@Test
	@DisplayName("280 文字は通り、281 文字は 280 文字の文言で弾かれる")
	void lengthBoundary() {
		assertThat(PostBodyRules.validate("あ".repeat(280), false)).isEqualTo("あ".repeat(280));

		assertRejected("あ".repeat(281), false, TOO_LONG);
	}

	@Test
	@DisplayName("絵文字は 1 文字と数える。280 個は通り、281 個は弾かれる")
	void emojiCountsAsOne() {
		assertThat(PostBodyRules.validate("😀".repeat(280), false)).isEqualTo("😀".repeat(280));

		assertRejected("😀".repeat(281), false, TOO_LONG);
	}

	@Test
	@DisplayName("CRLF は LF に直してから数える。270 文字の間に CRLF を 10 個入れた本文は通り、LF が 10 個残る")
	void crlfIsCountedAsOne() {
		String raw = "あ".repeat(27) + "\r\n" + ("あ".repeat(27) + "\r\n").repeat(9);

		String body = PostBodyRules.validate(raw, false);

		assertThat(body).doesNotContain("\r");
		assertThat(body.chars().filter(c -> c == '\n').count()).isEqualTo(10);
		assertThat(body.codePointCount(0, body.length())).isEqualTo(280);
	}

	@ParameterizedTest(name = "{index}: 使えない文字")
	@ValueSource(strings = { "a\u0000b", "ab\u0000", "\uD800" })
	@DisplayName("NUL と対になっていないサロゲートは、使えない文字の文言で弾かれる")
	void unusableChars(String raw) {
		assertRejected(raw, false, UNUSABLE);
		assertRejected(raw, true, UNUSABLE);
	}

	@Test
	@DisplayName("空文字と null は、画像が無ければ「本文か画像を入れてください」")
	void emptyWithoutImages() {
		assertRejected("", false, EMPTY);
		assertRejected(null, false, EMPTY);
	}

	@Test
	@DisplayName("空白と改行だけ（全角空白を含む）の本文は、画像が無ければ「本文か画像を入れてください」")
	void whitespaceOnlyWithoutImages() {
		assertRejected(" \n　 ", false, EMPTY);
		assertRejected(" \r\n　 ", false, EMPTY);
	}

	@Test
	@DisplayName("空白だけの本文は、画像があれば空文字として返る")
	void whitespaceOnlyWithImages() {
		assertThat(PostBodyRules.validate(" \n　 ", true)).isEmpty();
	}

	@Test
	@DisplayName("前後の空白は、そのまま返る")
	void surroundingWhitespaceIsKept() {
		assertThat(PostBodyRules.validate("  前後の空白  ", false)).isEqualTo("  前後の空白  ");
	}

	@Test
	@DisplayName("空文字と null は、画像があれば空文字が返る")
	void emptyWithImages() {
		assertThat(PostBodyRules.validate("", true)).isEmpty();
		assertThat(PostBodyRules.validate(null, true)).isEmpty();
	}

	@Test
	@DisplayName("規則の順序: 使えない文字は長さより先に判定される")
	void unusableCharsComeBeforeLength() {
		assertRejected("あ".repeat(300) + "\u0000", false, UNUSABLE);
	}

	@Test
	@DisplayName("規則の順序: 空白だけの本文は、長さの判定の前に空になる。長い空白だけの本文は長さではなく空として扱う")
	void longWhitespaceOnlyIsEmptyNotTooLong() {
		assertRejected(" ".repeat(300), false, EMPTY);
		assertThat(PostBodyRules.validate(" ".repeat(300), true)).isEmpty();
	}

	@Test
	@DisplayName("誤りの errors は body の 1 件だけ")
	void errorsHasOneEntry() {
		assertThatThrownBy(() -> PostBodyRules.validate("", false))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).isEqualTo(List.of(new FieldError("body", EMPTY))));
	}

}

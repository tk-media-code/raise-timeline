package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ValidationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class SearchQueriesTest {

	private static void assertRejected(String raw, String message) {
		assertThatThrownBy(() -> SearchQueries.validate(raw))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).containsExactly(new FieldError("q", message)));
	}

	@ParameterizedTest(name = "[{index}]")
	@NullSource
	@ValueSource(strings = { "", "   ", "　　", "\u00A0", "\u2007", "\u202F", "\uFEFF", "\u00A0 \u3000\uFEFF" })
	@DisplayName("null・空・半角空白だけ・全角空白だけ・U+00A0 などの空白の文字だけは 検索する語を入力してください")
	void blankIsRejected(String raw) {
		assertRejected(raw, SearchQueries.REQUIRED);
	}

	@Test
	@DisplayName("前後の空白（半角・全角）を除いた値を返す")
	void surroundingWhitespaceIsStripped() {
		assertThat(SearchQueries.validate(" ali ")).isEqualTo("ali");
		assertThat(SearchQueries.validate("　アリス　")).isEqualTo("アリス");
		assertThat(SearchQueries.validate("\u00A0ali\uFEFF\u202F")).isEqualTo("ali");
	}

	@Test
	@DisplayName("1 文字は通る。50 コードポイントは通り、51 は 50 文字以内で入力してください")
	void lengthBoundary() {
		assertThat(SearchQueries.validate("a")).isEqualTo("a");
		assertThat(SearchQueries.validate("a".repeat(50))).isEqualTo("a".repeat(50));

		assertRejected("a".repeat(51), SearchQueries.TOO_LONG);
	}

	@Test
	@DisplayName("絵文字は 1 文字と数える")
	void emojiCountsAsOne() {
		assertThat(SearchQueries.validate("😀".repeat(50))).isEqualTo("😀".repeat(50));

		assertRejected("😀".repeat(51), SearchQueries.TOO_LONG);
	}

	@Test
	@DisplayName("前後の空白は数えない")
	void surroundingWhitespaceIsNotCounted() {
		assertThat(SearchQueries.validate(" " + "a".repeat(50) + " ")).isEqualTo("a".repeat(50));
	}

	@ParameterizedTest(name = "[{index}]")
	@ValueSource(strings = { "a\u0000b", "\u0000", "a\uD800b", "\uDC00" })
	@DisplayName("NUL と対になっていないサロゲートは 使えない文字が含まれています")
	void unusableCharsAreRejected(String raw) {
		assertRejected(raw, SearchQueries.UNUSABLE_CHARS);
	}

	@Test
	@DisplayName("空白と NUL だけなら、空の判定より先に 使えない文字が含まれています になる")
	void unusableCharsComeBeforeBlankCheck() {
		assertRejected("\u0000 ", SearchQueries.UNUSABLE_CHARS);
	}

	@Test
	@DisplayName("51 文字で NUL を含むなら、長さの判定より先に 使えない文字が含まれています になる")
	void unusableCharsComeBeforeLengthCheck() {
		assertRejected("a".repeat(51) + "\u0000", SearchQueries.UNUSABLE_CHARS);
	}

	@Test
	@DisplayName("誤りの field は q")
	void fieldIsQ() {
		assertThatThrownBy(() -> SearchQueries.validate(""))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).extracting(FieldError::field).containsExactly("q"));
	}

	@ParameterizedTest(name = "[{index}] {0}")
	@CsvSource(delimiter = '|', textBlock = """
			ali    | %ali%
			100%   | %100\\%%
			a_c    | %a\\_c%
			a\\    | %a\\\\%
			\\%    | %\\\\\\%%
			""")
	@DisplayName("containsPattern は前後に % を付け、\\ と % と _ をエスケープする")
	void containsPatternEscapes(String q, String expected) {
		assertThat(SearchQueries.containsPattern(q)).isEqualTo(expected);
	}

}

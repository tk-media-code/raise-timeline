package com.tkmedia.raisetimeline.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class TextRulesTest {

	@ParameterizedTest
	@ValueSource(strings = { "\u0000", "a\u0000b", "\uD800", "\uDC00", "a\uD800b", "\uDE00\uD83D", "\uD83Da" })
	@DisplayName("NUL や対になっていないサロゲートは使えない文字として検出する")
	void unusableCharsAreDetected(String value) {
		assertThat(TextRules.containsUnusableChars(value)).isTrue();
	}

	@ParameterizedTest
	@ValueSource(strings = { "😀", "あいう", "" })
	@NullSource
	@DisplayName("対になったサロゲート・日本語・空文字・null は使えない文字として扱わない")
	void usableTextIsNotDetected(String value) {
		assertThat(TextRules.containsUnusableChars(value)).isFalse();
	}

	@ParameterizedTest
	@MethodSource("newlineCases")
	@DisplayName("CRLF だけを LF にし、単独の CR は変えない")
	void normalizeNewlines(String input, String expected) {
		assertThat(TextRules.normalizeNewlines(input)).isEqualTo(expected);
	}

	static Stream<Arguments> newlineCases() {
		return Stream.of(Arguments.of("a\r\nb", "a\nb"), Arguments.of("\r\n\r\n", "\n\n"),
				Arguments.of("a\nb", "a\nb"), Arguments.of("a\rb", "a\rb"));
	}

	@ParameterizedTest
	@NullSource
	@DisplayName("normalizeNewlines は null を null のまま返す")
	void normalizeNewlinesKeepsNull(String value) {
		assertThat(TextRules.normalizeNewlines(value)).isNull();
	}

	@ParameterizedTest
	@MethodSource("codePointCases")
	@DisplayName("コードポイントで数える")
	void codePointLength(String value, int expected) {
		assertThat(TextRules.codePointLength(value)).isEqualTo(expected);
	}

	static Stream<Arguments> codePointCases() {
		return Stream.of(Arguments.of("\uD83D\uDE00", 1), Arguments.of("あa", 2), Arguments.of("\uD800", 1));
	}

}

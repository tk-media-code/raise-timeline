package com.tkmedia.raisetimeline.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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

	@Test
	@DisplayName("前後の U+00A0・U+3000・U+FEFF・U+2007・U+202F・半角空白・タブ・改行を除き、中の空白は残す")
	void stripBlankRemovesSurroundingBlankChars() {
		String raw = " \u00A0\u3000\u2007\u202F\t\n山田\u3000太郎\uFEFF\r\n";

		assertThat(TextRules.stripBlank(raw)).isEqualTo("山田\u3000太郎");
	}

	@Test
	@DisplayName("stripBlank は null を null のまま返し、空白だけなら空文字を返す")
	void stripBlankKeepsNullAndEmptiesBlank() {
		assertThat(TextRules.stripBlank(null)).isNull();
		assertThat(TextRules.stripBlank(" \u00A0\u3000")).isEmpty();
		assertThat(TextRules.stripBlank("a")).isEqualTo("a");
	}

	@ParameterizedTest
	@ValueSource(strings = { "", " ", "\u00A0", "\u2007", "\u202F", "\uFEFF", "\u3000", "\t\r\n", " \u00A0\u3000\uFEFF" })
	@NullSource
	@DisplayName("空白の文字だけ・空文字・null は isBlank が true")
	void blankTextIsBlank(String value) {
		assertThat(TextRules.isBlank(value)).isTrue();
	}

	@ParameterizedTest
	@ValueSource(strings = { "a", " a ", "\u00A0あ", "\u0000" })
	@DisplayName("空白でない文字を含めば isBlank は false")
	void textWithContentIsNotBlank(String value) {
		assertThat(TextRules.isBlank(value)).isFalse();
	}

	@Test
	@DisplayName("幅の無い文字（U+200B）は空白とみなさない")
	void zeroWidthSpaceIsNotBlank() {
		assertThat(TextRules.isBlank("\u200B")).isFalse();
		assertThat(TextRules.stripBlank("\u200B")).isEqualTo("\u200B");
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

package com.tkmedia.raisetimeline.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

class UsernamesTest {

	/** 規則に合わない値（null を除く）。サービスのテストも同じ値で確かめる。 */
	public static Stream<String> malformedValues() {
		return Stream.of("", "ab", "a".repeat(21), "a b", "日本語", "a\u0000b", "me");
	}

	@ParameterizedTest(name = "[{index}] {0}")
	@ValueSource(strings = { "abc", "A_1", "aaaaaaaaaaaaaaaaaaaa" })
	@DisplayName("3〜20 文字の英数字と _ は規則に合う")
	void wellFormed(String value) {
		assertThat(Usernames.isWellFormed(value)).isTrue();
	}

	@Test
	@DisplayName("null は規則に合わない")
	void nullIsMalformed() {
		assertThat(Usernames.isWellFormed(null)).isFalse();
	}

	@ParameterizedTest(name = "[{index}]")
	@MethodSource("malformedValues")
	@DisplayName("空・短すぎ・長すぎ・空白・日本語・NUL は規則に合わない")
	void malformed(String value) {
		assertThat(Usernames.isWellFormed(value)).isFalse();
	}

}

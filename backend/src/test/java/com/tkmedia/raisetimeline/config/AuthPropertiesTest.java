package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class AuthPropertiesTest {

	@Test
	@DisplayName("解決されなかった ${JWT_SECRET} のままの文字列は、署名鍵として受け付けない")
	void unresolvedPlaceholderIsRejected() {
		assertRejected("${JWT_SECRET}");
	}

	@Test
	@DisplayName("31 バイトの Base64 は短すぎるので受け付けない")
	void thirtyOneBytesIsRejected() {
		assertRejected(Base64.getEncoder().encodeToString(new byte[31]));
	}

	@ParameterizedTest(name = "[{index}] 未設定や空の署名鍵は受け付けない")
	@DisplayName("null・空・空白だけの署名鍵は受け付けない")
	@NullAndEmptySource
	@ValueSource(strings = { "   " })
	void blankIsRejected(String secret) {
		assertThatThrownBy(() -> create(secret))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("JWT_SECRET");
	}

	@Test
	@DisplayName("32 バイトの Base64 は受け付ける")
	void thirtyTwoBytesIsAccepted() {
		String secret = Base64.getEncoder().encodeToString(new byte[32]);

		assertThatCode(() -> create(secret)).doesNotThrowAnyException();
	}

	@Test
	@DisplayName("toString は署名鍵を出さない")
	void toStringHidesSecret() {
		String secret = Base64.getEncoder().encodeToString(new byte[32]);

		assertThat(create(secret).toString()).doesNotContain(secret);
	}

	@Test
	@DisplayName("猶予が null なら受け付けない")
	void nullGraceIsRejected() {
		assertThatThrownBy(() -> create(validSecret(), null))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("auth.refresh-token-grace");
	}

	@Test
	@DisplayName("猶予が負なら受け付けない")
	void negativeGraceIsRejected() {
		assertThatThrownBy(() -> create(validSecret(), Duration.ofSeconds(-1)))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("auth.refresh-token-grace");
	}

	@Test
	@DisplayName("猶予 0 は受け付ける（猶予なし、元の使い捨て）")
	void zeroGraceIsAccepted() {
		assertThatCode(() -> create(validSecret(), Duration.ZERO)).doesNotThrowAnyException();
	}

	@Test
	@DisplayName("toString に猶予が出る")
	void toStringShowsGrace() {
		assertThat(create(validSecret()).toString()).contains("refreshTokenGrace=PT1M");
	}

	private static String validSecret() {
		return Base64.getEncoder().encodeToString(new byte[32]);
	}

	/** 拒否されること。文言は環境変数名を示し、渡された値を含まない。 */
	private static void assertRejected(String secret) {
		assertThatThrownBy(() -> create(secret))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("JWT_SECRET")
				.hasMessageNotContaining(secret)
				.hasNoCause();
	}

	private static AuthProperties create(String secret) {
		return create(secret, Duration.ofSeconds(60));
	}

	private static AuthProperties create(String secret, Duration grace) {
		return new AuthProperties(secret, Duration.ofHours(1), Duration.ofDays(30), grace, "refresh_token", true,
				"raise-timeline");
	}

}

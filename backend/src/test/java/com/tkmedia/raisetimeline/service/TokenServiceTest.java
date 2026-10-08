package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tkmedia.raisetimeline.config.AuthProperties;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;

class TokenServiceTest {

	private static final Instant NOW = Instant.parse("2026-10-07T00:00:00Z");
	private static final String ISSUER = "raise-timeline";
	private static final SecureRandom RANDOM = new SecureRandom();
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");

	private final byte[] key = randomKey();
	private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
	// 実装と同じ組み立てを使う。テストの中で別に組み立てると、本番の設定とずれても気づけない。
	private final TokenService service = new TokenService(SecurityConfig.createJwtEncoder(key), properties(), clock);

	@Test
	@DisplayName("アクセストークンには sub・iss・exp（発行の 1 時間後）が入る")
	void accessTokenCarriesSubjectIssuerAndExpiry() {
		String token = service.issueAccessToken(USER_ID);

		Jwt jwt = SecurityConfig.createJwtDecoder(key, ISSUER, clock).decode(token);

		assertThat(jwt.getSubject()).isEqualTo(USER_ID.toString());
		assertThat(jwt.getClaimAsString("iss")).isEqualTo(ISSUER);
		assertThat(jwt.getIssuedAt()).isEqualTo(NOW);
		assertThat(jwt.getExpiresAt()).isEqualTo(NOW.plus(Duration.ofHours(1)));
		assertThat(jwt.getHeaders()).containsEntry("alg", "HS256");
	}

	@Test
	@DisplayName("有効期限を過ぎたアクセストークンは JwtValidationException で拒否される")
	void expiredTokenIsRejected() {
		String token = service.issueAccessToken(USER_ID);
		Clock twoHoursLater = Clock.fixed(NOW.plus(Duration.ofHours(2)), ZoneOffset.UTC);

		JwtDecoder decoder = SecurityConfig.createJwtDecoder(key, ISSUER, twoHoursLater);

		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	@DisplayName("別の鍵で署名されたアクセストークンは BadJwtException で拒否される")
	void tokenSignedWithOtherKeyIsRejected() {
		String token = service.issueAccessToken(USER_ID);

		JwtDecoder decoder = SecurityConfig.createJwtDecoder(randomKey(), ISSUER, clock);

		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(BadJwtException.class);
	}

	@Test
	@DisplayName("発行者が違うアクセストークンは拒否される")
	void tokenFromOtherIssuerIsRejected() {
		String token = service.issueAccessToken(USER_ID);

		JwtDecoder decoder = SecurityConfig.createJwtDecoder(key, "other-issuer", clock);

		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	@DisplayName("リフレッシュトークンは毎回違い、同じ値のハッシュは 64 文字の 16 進で変わらない")
	void refreshTokenIsRandomAndHashIsStable() {
		String first = service.newRefreshToken();
		String second = service.newRefreshToken();

		assertThat(first).isNotEqualTo(second);
		// 32 バイトを Base64URL（パディング無し）にすると 43 文字
		assertThat(first).matches("^[A-Za-z0-9_-]{43}$");
		String hash = service.hashRefreshToken(first);
		assertThat(hash).matches("^[0-9a-f]{64}$");
		assertThat(service.hashRefreshToken(first)).isEqualTo(hash);
		assertThat(service.hashRefreshToken(second)).isNotEqualTo(hash);
	}

	private AuthProperties properties() {
		return new AuthProperties(Base64.getEncoder().encodeToString(key), Duration.ofHours(1), Duration.ofDays(30),
				"refresh_token", true, ISSUER);
	}

	private static byte[] randomKey() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return bytes;
	}

}

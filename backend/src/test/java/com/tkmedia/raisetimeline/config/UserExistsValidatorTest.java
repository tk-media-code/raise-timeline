package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

class UserExistsValidatorTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");

	private final UserMapper userMapper = mock(UserMapper.class);
	private final UserExistsValidator validator = new UserExistsValidator(userMapper);

	private static Jwt jwtOf(String subject) {
		return Jwt.withTokenValue("token")
				.header("alg", "HS256")
				.subject(subject)
				.issuedAt(Instant.parse("2026-10-10T00:00:00Z"))
				.expiresAt(Instant.parse("2026-10-10T00:15:00Z"))
				.build();
	}

	@Test
	@DisplayName("いる利用者の sub なら成功する")
	void existingUserSucceeds() {
		when(userMapper.existsById(USER_ID)).thenReturn(true);

		OAuth2TokenValidatorResult result = validator.validate(jwtOf(USER_ID.toString()));

		assertThat(result.hasErrors()).isFalse();
	}

	@Test
	@DisplayName("いない利用者の sub なら失敗し、エラーの code は invalid_token")
	void missingUserFails() {
		when(userMapper.existsById(USER_ID)).thenReturn(false);

		OAuth2TokenValidatorResult result = validator.validate(jwtOf(USER_ID.toString()));

		assertThat(result.hasErrors()).isTrue();
		assertThat(result.getErrors()).singleElement()
				.satisfies(error -> assertThat(error.getErrorCode()).isEqualTo(OAuth2ErrorCodes.INVALID_TOKEN));
	}

	@Test
	@DisplayName("sub が UUID でなければ失敗し、DB に問い合わせない")
	void nonUuidSubjectFailsWithoutQuery() {
		OAuth2TokenValidatorResult result = validator.validate(jwtOf("not-a-uuid"));

		assertThat(result.hasErrors()).isTrue();
		assertThat(result.getErrors()).singleElement()
				.satisfies(error -> assertThat(error.getErrorCode()).isEqualTo(OAuth2ErrorCodes.INVALID_TOKEN));
		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("DB の例外は失敗に変えず、そのまま投げる")
	void databaseExceptionPropagates() {
		QueryTimeoutException timeout = new QueryTimeoutException("タイムアウト");
		when(userMapper.existsById(USER_ID)).thenThrow(timeout);

		assertThatThrownBy(() -> validator.validate(jwtOf(USER_ID.toString()))).isSameAs(timeout);
	}

}

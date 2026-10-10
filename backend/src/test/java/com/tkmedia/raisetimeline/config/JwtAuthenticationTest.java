package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.logging.LogLines;
import com.tkmedia.raisetimeline.service.TokenService;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(controllers = JwtAuthenticationTest.TestController.class)
@Import({ JwtAuthenticationTest.TestController.class, SecurityConfig.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class, TokenService.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
@ExtendWith(OutputCaptureExtension.class)
class JwtAuthenticationTest {

	// jwtDecoder が存在確認に使う。本物のトークンを送るテストは existsById を true にスタブする。
	@MockitoBean
	private UserMapper userMapper;

	private static final String PROBLEM_JSON = "application/problem+json";
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private TokenService tokenService;

	@Autowired
	private JwtEncoder encoder;

	@Autowired
	private AuthProperties properties;

	@BeforeEach
	void usersExist() {
		when(userMapper.existsById(any())).thenReturn(true);
	}

	@Test
	@DisplayName("TokenService が発行した Bearer トークンで認証でき、sub から利用者 id を取れる")
	void validBearerIsAccepted() throws Exception {
		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + tokenService.issueAccessToken(USER_ID)))
				.andExpect(status().isOk())
				.andExpect(content().string(USER_ID.toString()));
	}

	@Test
	@DisplayName("Bearer が無い要求は 401 の Problem Details（UNAUTHENTICATED）になる")
	void missingBearerReturns401Problem() throws Exception {
		mockMvc.perform(get("/api/t/whoami"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

	@Test
	@DisplayName("署名を改ざんした Bearer は 401 の Problem Details（UNAUTHENTICATED）になり、WARN と ERROR は出ない")
	void tamperedBearerReturns401Problem(CapturedOutput output) throws Exception {
		String token = tokenService.issueAccessToken(USER_ID);
		// 署名の先頭の 1 文字を変える。末尾の文字は Base64 の余りのビットだけが変わって、署名が同じ値に読まれることがある。
		int signatureStart = token.lastIndexOf('.') + 1;
		char replaced = token.charAt(signatureStart) == 'A' ? 'B' : 'A';
		String tampered = token.substring(0, signatureStart) + replaced + token.substring(signatureStart + 1);

		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + tampered))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("有効期限を過ぎた Bearer は 401 の Problem Details（UNAUTHENTICATED）になり、WARN と ERROR は出ない")
	void expiredBearerReturns401Problem(CapturedOutput output) throws Exception {
		Clock twoHoursAgo = Clock.offset(Clock.systemUTC(), Duration.ofHours(-2));
		String expired = new TokenService(encoder, properties, twoHoursAgo).issueAccessToken(USER_ID);

		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + expired))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("署名の正しいトークンでも、利用者がいなければ 401 UNAUTHENTICATED で、コントローラは呼ばれず、WARN と ERROR は出ない")
	void validSignatureButDeletedUserReturns401Problem(CapturedOutput output) throws Exception {
		when(userMapper.existsById(USER_ID)).thenReturn(false);

		// whoami は呼ばれると sub をそのまま返す。呼ばれていれば 200 になるので、401 であることがコントローラに
		// 届いていない証拠になる。
		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + tokenService.issueAccessToken(USER_ID)))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verify(userMapper).existsById(USER_ID);
		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("存在確認で DB が失敗したら、401 ではなく 500 INTERNAL_ERROR になる（全員がログアウトされない）")
	void existenceCheckFailureReturns500Problem() throws Exception {
		when(userMapper.existsById(USER_ID)).thenThrow(new QueryTimeoutException("db down"));

		// 401 にすると、画面は更新を試み、失敗すればログアウトさせてしまう。DB の障害は 500 のまま返す。
		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + tokenService.issueAccessToken(USER_ID)))
				.andExpect(status().isInternalServerError())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
	}

	@Test
	@DisplayName("期限切れのトークンでは、存在確認の問い合わせをしない")
	void expiredBearerDoesNotQueryUser() throws Exception {
		Clock twoHoursAgo = Clock.offset(Clock.systemUTC(), Duration.ofHours(-2));
		String expired = new TokenService(encoder, properties, twoHoursAgo).issueAccessToken(USER_ID);

		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + expired))
				.andExpect(status().isUnauthorized());

		verify(userMapper, never()).existsById(any());
	}

	@Test
	@DisplayName("発行者の違うトークンでも、存在確認の問い合わせをしない")
	void otherIssuerBearerDoesNotQueryUser() throws Exception {
		AuthProperties other = new AuthProperties(properties.jwtSecret(), properties.accessTokenTtl(),
				properties.refreshTokenTtl(), properties.cookieName(), properties.cookieSecure(), "other-issuer");
		String token = new TokenService(encoder, other, Clock.systemUTC()).issueAccessToken(USER_ID);

		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + token))
				.andExpect(status().isUnauthorized());

		verify(userMapper, never()).existsById(any());
	}

	@Test
	@DisplayName("署名の無い alg=none のトークンは 401 の Problem Details（UNAUTHENTICATED）になり、WARN と ERROR は出ない")
	void algNoneBearerReturns401Problem(CapturedOutput output) throws Exception {
		Base64.Encoder base64 = Base64.getUrlEncoder().withoutPadding();
		long exp = Clock.systemUTC().instant().plus(Duration.ofHours(1)).getEpochSecond();
		String header = base64.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
		String claims = base64.encodeToString(("{\"sub\":\"" + USER_ID + "\",\"iss\":\"raise-timeline\",\"exp\":" + exp + "}")
				.getBytes(StandardCharsets.UTF_8));

		mockMvc.perform(get("/api/t/whoami").header("Authorization", "Bearer " + header + "." + claims + "."))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("Bearer があっても、denyAll に当たれば本文の無い 403 ではなく Problem Details（FORBIDDEN）になる")
	void validBearerOnDeniedPathReturns403Problem() throws Exception {
		mockMvc.perform(get("/x").header("Authorization", "Bearer " + tokenService.issueAccessToken(USER_ID)))
				.andExpect(status().isForbidden())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("FORBIDDEN"));
	}

	// 不正なトークンは利用者の側の事情であって、サーバーの不具合ではない。
	// ログが 1 行も読めていないと noneSatisfy は空振りで通ってしまうので、先に行があることを確かめる。
	private static void assertNoWarnOrError(CapturedOutput output) {
		assertThat(LogLines.parse(output)).isNotEmpty();
		assertThat(LogLines.parse(output)).noneSatisfy(line -> assertThat(LogLines.get(line, "log.level"))
				.isIn("WARN", "ERROR"));
	}

	@RestController
	static class TestController {

		@GetMapping("/api/t/whoami")
		String whoami(@AuthenticationPrincipal Jwt jwt) {
			return UUID.fromString(Objects.requireNonNull(jwt.getSubject())).toString();
		}

	}

}

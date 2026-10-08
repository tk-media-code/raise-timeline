package com.tkmedia.raisetimeline.config;

import com.tkmedia.raisetimeline.error.ErrorCode;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.web.UserIdLogFilter;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import jakarta.servlet.DispatcherType;
import java.time.Clock;
import java.util.Base64;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.firewall.RequestRejectedHandler;

/**
 * どの URL を誰に開くかを決める。既定は拒否で、開けるものだけを書く。
 *
 * <p>{@link AuthProperties} の登録もここで行う。{@code @WebMvcTest} は {@code @ConfigurationProperties} の
 * Bean を拾わないので、テストでは {@code @Import(SecurityConfig.class)} だけで揃うようにしている。
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {

	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http, ProblemDetailWriter writer) throws Exception {
		// 401 の応答は 1 つ作り、exceptionHandling と oauth2ResourceServer の両方に渡す。oauth2ResourceServer に
		// 渡さないと、Bearer 付きの要求だけ Spring の既定（本文の無い 401）にすり替わり、画面の API クライアントが
		// code を読めなくなる（期限切れの更新が動かない）。403 は exceptionHandling の指定だけで Bearer 付きにも効く。
		AuthenticationEntryPoint entryPoint = (req, res, ex) -> writer.write(req, res, ErrorCode.UNAUTHENTICATED);
		AccessDeniedHandler accessDeniedHandler = (req, res, ex) -> writer.write(req, res, ErrorCode.FORBIDDEN);
		http
				// 認証は Cookie ではなく Authorization ヘッダーの Bearer トークンで行う。ブラウザが勝手に付ける
				// 認証情報が無いので、CSRF の攻撃が成り立たない。
				.csrf(AbstractHttpConfigurer::disable)
				// サーバー側にセッションを持たない。状態はトークンに入れる。
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.formLogin(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				// 未ログインの 401 と、ログイン済みだが許されない 403 を、例外ハンドラと同じ Problem Details で返す。
				// Security のフィルタは MVC の外で動くので、@RestControllerAdvice は働かない。
				.exceptionHandling(e -> e
						.authenticationEntryPoint(entryPoint)
						.accessDeniedHandler(accessDeniedHandler))
				// Authorization: Bearer のアクセストークン（JWT）を検証して認証する。壊れた・期限切れ・別の鍵のトークンも
				// ここで同じ 401 の Problem Details になる。
				.oauth2ResourceServer(o -> o
						.authenticationEntryPoint(entryPoint)
						.jwt(Customizer.withDefaults()))
				// 認証が済んだ直後に user.id を MDC に置く。Bean にせず、ここで new する（クラスの説明を参照）。
				.addFilterAfter(new UserIdLogFilter(), BearerTokenAuthenticationFilter.class)
				.authorizeHttpRequests(auth -> auth
						// ERROR ディスパッチ（sendError の後の /error）は無条件で通す。下の denyAll が /error にもかかると、
						// sendError で決めた status が本文の無い 403 にすり替わり、要求ログ（元の status）と食い違う。
						.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
						.requestMatchers("/api/health", "/api/auth/**").permitAll()
						.requestMatchers("/api/**").authenticated()
						// 本番の nginx は /api/ だけを Spring に転送する。それ以外が届いたら、開けてはいけない。
						.anyRequest().denyAll());
		return http.build();
	}

	/**
	 * Spring Security のファイアウォールが URL を拒否したとき（{@code /api/health;x=1} のようなセミコロン付きなど）の応答。
	 * 既定は {@code sendError(400)} で、ERROR ディスパッチの先で本文の無い応答になる。ここで Problem Details の 400 を
	 * 直接書き、{@code sendError} に頼らない。ファイアウォールはこの型の Bean が 1 つあれば自動で使う。
	 */
	@Bean
	public RequestRejectedHandler requestRejectedHandler(ProblemDetailWriter writer) {
		return (req, res, ex) -> writer.write(req, res, ErrorCode.BAD_REQUEST);
	}

	/** パスワードのハッシュ化。BCrypt はソルトを内に持ち、計算を遅くして総当たりを難しくする。 */
	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	/** アクセストークンの署名に使う。{@link com.tkmedia.raisetimeline.service.TokenService} が使う。 */
	@Bean
	public JwtEncoder jwtEncoder(AuthProperties props) {
		return createJwtEncoder(decodeKey(props));
	}

	/**
	 * アクセストークンの検証に使う。時刻の判定には、アプリ全体で使う {@link Clock} を渡す。
	 */
	@Bean
	public JwtDecoder jwtDecoder(AuthProperties props, Clock clock) {
		return createJwtDecoder(decodeKey(props), props.issuer(), clock);
	}

	/** HS256 の発行側。Bean とテストが同じ作り方になるよう、組み立てはここ 1 か所にする。 */
	public static JwtEncoder createJwtEncoder(byte[] key) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(key));
	}

	/**
	 * HS256 の検証側。署名・有効期限・発行者（iss）を確かめる。
	 *
	 * <p>{@code JwtValidators.createDefaultWithIssuer} には Clock を渡す口が無く、期限の判定がシステム時計に
	 * 固定される。アプリは Clock を Bean で持ち、テストで差し替えて時刻を固定するので、同じ中身
	 * （期限の検証 + 発行者の検証）を Clock つきで組み立てている。
	 */
	public static JwtDecoder createJwtDecoder(byte[] key, String issuer, Clock clock) {
		// javax.crypto は JDK の標準で、Jakarta EE 移行前のパッケージではない。ただし Checkstyle が javax の import を
		// 一律に禁じているので、import せず完全修飾名で書く。
		NimbusJwtDecoder decoder = NimbusJwtDecoder
				.withSecretKey(new javax.crypto.spec.SecretKeySpec(key, "HmacSHA256"))
				.macAlgorithm(MacAlgorithm.HS256)
				.build();
		JwtTimestampValidator timestampValidator = new JwtTimestampValidator();
		timestampValidator.setClock(clock);
		OAuth2TokenValidator<Jwt> validator = new DelegatingOAuth2TokenValidator<>(
				timestampValidator, new JwtIssuerValidator(issuer));
		decoder.setJwtValidator(validator);
		return decoder;
	}

	// Base64 として読めるか・32 バイト以上かは AuthProperties が起動時に確かめている。
	private static byte[] decodeKey(AuthProperties props) {
		return Base64.getDecoder().decode(props.jwtSecret());
	}

}

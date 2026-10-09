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
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * どの URL を誰に開くかを決める。既定は拒否で、開けるものだけを書く。
 *
 * <p>{@link AuthProperties} の登録もここで行う。{@code @WebMvcTest} は {@code @ConfigurationProperties} の
 * Bean を拾わないので、{@code @Import(SecurityConfig.class)} で {@link AuthProperties} が揃う。
 * ただし {@link ProblemDetailWriter} と {@link ClockConfig} は別の Bean なので、テストではこの 2 つも
 * {@code @Import} に足す。
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
				// API の認証は Authorization ヘッダーの Bearer トークンで行い、ブラウザが勝手に付ける認証情報は無い。
				// Cookie で動くのは更新とログアウトの 2 本だけで、これは SameSite=Lax の Cookie が守る
				// （別サイトからの POST には付かない。docs/auth-design.md 6 章）。そのため CSRF トークンの仕組みは使わない。
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
						.bearerTokenResolver(bearerTokenResolver())
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
	 * {@code /api/auth/} 配下では Authorization ヘッダーを読まない。それ以外は既定の読み方に委ねる。
	 *
	 * <p>画面の側に期限切れのアクセストークンが残っていて、それが Bearer として付いたまま更新やログアウトが送られると、
	 * 認証フィルタが先にそのトークンを検証して 401 にしてしまい、本来は Cookie だけで決まるはずの更新が失敗し、
	 * 「ログアウトは常に 204」（docs/features/auth.md 3 章）も守れなくなる。この配下は Cookie か本文で認証する
	 * 口なので、Bearer は最初から無いものとして扱う。画面側も Bearer を付けないが、サーバー側でも守る。
	 */
	private static BearerTokenResolver bearerTokenResolver() {
		DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();
		PathPatternRequestMatcher authApi = PathPatternRequestMatcher.withDefaults().matcher("/api/auth/**");
		return request -> authApi.matches(request) ? null : delegate.resolve(request);
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
	 * 固定される。アプリは Clock を Bean で持ち、テストで差し替えて時刻を固定するので、Clock を設定した
	 * 期限の検証を {@code createDefaultWithValidators} に渡す。この関数は、渡された検証と同じ型の既定の検証
	 * （期限）を重ねて入れないので、Clock つきの検証が残る。既定の型（typ）と thumbprint の検証もここで加わる。
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
		decoder.setJwtValidator(JwtValidators.createDefaultWithValidators(timestampValidator,
				new JwtIssuerValidator(issuer)));
		return decoder;
	}

	// Base64 として読めるか・32 バイト以上かは AuthProperties が起動時に確かめている。
	private static byte[] decodeKey(AuthProperties props) {
		return Base64.getDecoder().decode(props.jwtSecret());
	}

}

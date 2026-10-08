package com.tkmedia.raisetimeline.config;

import com.tkmedia.raisetimeline.error.ErrorCode;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.web.UserIdLogFilter;
import jakarta.servlet.DispatcherType;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
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
						.authenticationEntryPoint((req, res, ex) -> writer.write(req, res, ErrorCode.UNAUTHENTICATED))
						.accessDeniedHandler((req, res, ex) -> writer.write(req, res, ErrorCode.FORBIDDEN)))
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

}

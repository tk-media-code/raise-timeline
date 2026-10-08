package com.tkmedia.raisetimeline.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

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
	public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http
				// 認証は Cookie ではなく Authorization ヘッダーの Bearer トークンで行う。ブラウザが勝手に付ける
				// 認証情報が無いので、CSRF の攻撃が成り立たない。
				.csrf(AbstractHttpConfigurer::disable)
				// サーバー側にセッションを持たない。状態はトークンに入れる。
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.formLogin(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/api/health", "/api/auth/**").permitAll()
						.requestMatchers("/api/**").authenticated()
						// 本番の nginx は /api/ だけを Spring に転送する。それ以外が届いたら、開けてはいけない。
						.anyRequest().denyAll());
		return http.build();
	}

	/** パスワードのハッシュ化。BCrypt はソルトを内に持ち、計算を遅くして総当たりを難しくする。 */
	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

}

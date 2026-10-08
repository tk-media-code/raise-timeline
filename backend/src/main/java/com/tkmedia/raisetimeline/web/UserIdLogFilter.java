package com.tkmedia.raisetimeline.web;

import com.tkmedia.raisetimeline.logging.LogFields;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 認証できた利用者の id を MDC の {@code user.id} に置く。以降のすべてのログ行（要求ログを含む）に付く。
 *
 * <p>Bean にしない。{@code Filter} 型の Bean は Spring Boot がサーブレットのフィルタとしても
 * 自動で登録するので、Security の外でもう 1 回動いてしまう。{@code SecurityConfig} の中で {@code new} する。
 *
 * <p>MDC は消さない。消すのは {@link RequestLogFilter} だけで、要求ログを書いた後に消す。
 * ここで消すと、要求ログの行から {@code user.id} が抜ける。
 */
public class UserIdLogFilter extends OncePerRequestFilter {

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication instanceof JwtAuthenticationToken token) {
			// JWT の subject は利用者 id（UUID）。名前やメールアドレスは載せない。
			MDC.put(LogFields.USER_ID, token.getName());
		}
		chain.doFilter(request, response);
	}

}

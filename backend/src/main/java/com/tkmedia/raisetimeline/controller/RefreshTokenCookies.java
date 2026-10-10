package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.config.AuthProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

/**
 * リフレッシュトークンの Cookie を、付けるとき・消すとき・読むときの作り方を 1 か所にまとめる。
 *
 * <p>付けるときと消すときで属性（Path・HttpOnly・SameSite・Secure）がずれると、ブラウザは別の Cookie として
 * 扱い、消したつもりの Cookie が残る。作り方を分けて書かないために、ここだけで作る。
 */
@Component
public class RefreshTokenCookies {

	/** Cookie を送るパス。リフレッシュトークンを必要とする要求にだけ付くよう、認証の API に絞る。 */
	private static final String COOKIE_PATH = "/api/auth";

	private final AuthProperties props;

	public RefreshTokenCookies(AuthProperties props) {
		this.props = props;
	}

	/** リフレッシュトークンを入れる Cookie。有効期間はリフレッシュトークンの有効期間と同じ。 */
	public ResponseCookie issue(String value) {
		return cookie(value, props.refreshTokenTtl());
	}

	/** Cookie を消す（空の値で、有効期間を 0 にする）。属性は {@link #issue} と揃える。 */
	public ResponseCookie clear() {
		return cookie("", Duration.ZERO);
	}

	/** 要求の Cookie の値。無ければ null。 */
	public String read(HttpServletRequest request) {
		Cookie cookie = WebUtils.getCookie(request, props.cookieName());
		return cookie == null ? null : cookie.getValue();
	}

	private ResponseCookie cookie(String value, Duration maxAge) {
		return ResponseCookie.from(props.cookieName(), value)
				.httpOnly(true)
				.secure(props.cookieSecure())
				.sameSite("Lax")
				.path(COOKIE_PATH)
				.maxAge(maxAge)
				.build();
	}

}

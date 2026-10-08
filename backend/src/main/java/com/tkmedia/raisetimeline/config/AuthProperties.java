package com.tkmedia.raisetimeline.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 認証の設定値。{@code application.properties} の {@code auth.*} を受け取る。
 *
 * @param jwtSecret アクセストークンの署名鍵（Base64）
 * @param accessTokenTtl アクセストークンの有効期間
 * @param refreshTokenTtl リフレッシュトークンの有効期間
 * @param cookieName リフレッシュトークンを入れる Cookie の名前
 * @param cookieSecure Cookie に Secure を付けるか
 * @param issuer JWT の発行者
 */
@ConfigurationProperties("auth")
public record AuthProperties(
		String jwtSecret,
		Duration accessTokenTtl,
		Duration refreshTokenTtl,
		String cookieName,
		boolean cookieSecure,
		String issuer) {

	/** 署名鍵をログや例外に出さない（record の toString は全項目を出すため）。 */
	@Override
	public String toString() {
		return "AuthProperties[jwtSecret=***, accessTokenTtl=" + accessTokenTtl
				+ ", refreshTokenTtl=" + refreshTokenTtl + ", cookieName=" + cookieName
				+ ", cookieSecure=" + cookieSecure + ", issuer=" + issuer + "]";
	}

}

package com.tkmedia.raisetimeline.config;

import java.time.Duration;
import java.util.Base64;
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

	/** HS256 の署名鍵に求める最小の長さ（バイト）。ハッシュ（256 ビット）より短い鍵は強度が足りない。 */
	private static final int MIN_SECRET_BYTES = 32;

	/**
	 * 署名鍵が使えない値なら、起動時にここで止める。
	 *
	 * <p>{@code @ConfigurationProperties} の束縛は、解決できない {@code ${JWT_SECRET}} を例外にせず、
	 * 文字列のまま渡してくる。ここで確かめないと、環境変数の渡し忘れに気づかないまま起動してしまう。
	 * 例外の文言には、渡された値を入れない（鍵がログに残らないようにする）。
	 */
	public AuthProperties {
		if (jwtSecret == null || jwtSecret.isBlank()) {
			throw invalidSecret();
		}
		byte[] decoded;
		try {
			decoded = Base64.getDecoder().decode(jwtSecret);
		} catch (IllegalArgumentException e) {
			// 原因の例外は、文言に値を含むことがあるので引き継がない。
			throw invalidSecret();
		}
		if (decoded.length < MIN_SECRET_BYTES) {
			throw invalidSecret();
		}
	}

	private static IllegalStateException invalidSecret() {
		return new IllegalStateException(
				"環境変数 JWT_SECRET が未設定か、使えない値です。32 バイト以上のデータを Base64 にした文字列を渡してください");
	}

	/** 署名鍵をログや例外に出さない（record の toString は全項目を出すため）。 */
	@Override
	public String toString() {
		return "AuthProperties[jwtSecret=***, accessTokenTtl=" + accessTokenTtl
				+ ", refreshTokenTtl=" + refreshTokenTtl + ", cookieName=" + cookieName
				+ ", cookieSecure=" + cookieSecure + ", issuer=" + issuer + "]";
	}

}

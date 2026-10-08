package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.config.AuthProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * アクセストークン（JWT）の発行と、リフレッシュトークンの生成・ハッシュ化。
 *
 * <p>JWT の検証は {@code SecurityConfig} の {@code JwtDecoder} が受け持つので、ここには持たない。
 */
@Service
public class TokenService {

	/** リフレッシュトークンの乱数の長さ（バイト）。256 ビットあれば、総当たりで当てられない。 */
	private static final int REFRESH_TOKEN_BYTES = 32;

	private final JwtEncoder encoder;
	private final AuthProperties props;
	private final Clock clock;
	private final SecureRandom random = new SecureRandom();

	public TokenService(JwtEncoder encoder, AuthProperties props, Clock clock) {
		this.encoder = encoder;
		this.props = props;
		this.clock = clock;
	}

	/** 利用者 id を {@code sub} に持つアクセストークンを、{@code accessTokenTtl} の有効期間で発行する。 */
	public String issueAccessToken(UUID userId) {
		Instant now = clock.instant();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject(userId.toString())
				.issuer(props.issuer())
				.issuedAt(now)
				.expiresAt(now.plus(props.accessTokenTtl()))
				.build();
		// ヘッダーの alg を明示する。省略すると既定の RS256 になり、HMAC の鍵では署名できない。
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}

	/** 推測できないリフレッシュトークンの生の値を作る。Cookie に入れるのはこの値で、DB にはハッシュだけを置く。 */
	public String newRefreshToken() {
		byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	/**
	 * リフレッシュトークンの SHA-256（16 進の小文字）。DB が漏れても、そのままではトークンとして使えないようにする。
	 * 乱数そのものが十分に長いので、パスワードと違って BCrypt のような遅いハッシュは要らない。
	 */
	public String hashRefreshToken(String raw) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		} catch (NoSuchAlgorithmException e) {
			// SHA-256 は Java が必ず備える。ここに来るのは実行環境が壊れているとき。
			throw new IllegalStateException("SHA-256 が使えない", e);
		}
	}

}

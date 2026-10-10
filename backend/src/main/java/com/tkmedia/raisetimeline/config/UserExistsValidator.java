package com.tkmedia.raisetimeline.config;

import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.util.UUID;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * アクセストークンの {@code sub} の利用者がまだいるかを確かめる。
 *
 * <p>アクセストークンは署名と期限しか見ないので、退会して行が消えても、期限まで通ってしまう。
 * 認証のたびに 1 回だけ主キーで引いて、いなければ {@code invalid_token}（応答は 401 UNAUTHENTICATED）にする。
 *
 * <p>DB が答えなかったとき（接続の失敗やタイムアウト）の例外は、捕まえずにそのまま投げる。401 にすると、
 * 画面はトークンの更新を試み、それも失敗してログアウトさせてしまう。DB の障害で全員がログアウトされないよう、
 * 500 のままにする。
 */
final class UserExistsValidator implements OAuth2TokenValidator<Jwt> {

	private final UserMapper userMapper;

	UserExistsValidator(UserMapper userMapper) {
		this.userMapper = userMapper;
	}

	@Override
	public OAuth2TokenValidatorResult validate(Jwt jwt) {
		UUID userId;
		try {
			userId = UUID.fromString(String.valueOf(jwt.getSubject()));
		} catch (IllegalArgumentException e) {
			// 署名が正しい以上まず起きない。起きても CurrentUser.idOf の例外で 500 にせず、DB にも問い合わせない。
			return failure("sub が利用者の id として読めない");
		}
		if (!userMapper.existsById(userId)) {
			return failure("利用者がいない");
		}
		return OAuth2TokenValidatorResult.success();
	}

	private static OAuth2TokenValidatorResult failure(String description) {
		return OAuth2TokenValidatorResult.failure(new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, description, null));
	}

}

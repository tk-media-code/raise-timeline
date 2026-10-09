package com.tkmedia.raisetimeline.controller;

import java.util.Objects;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/** ログイン中の利用者の取り出し。利用者 id は、署名を確かめた JWT の sub から取る。 */
final class CurrentUser {

	private CurrentUser() {
	}

	static UUID idOf(Jwt jwt) {
		return UUID.fromString(Objects.requireNonNull(jwt.getSubject()));
	}

}

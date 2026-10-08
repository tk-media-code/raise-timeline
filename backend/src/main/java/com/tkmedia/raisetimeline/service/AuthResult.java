package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.dto.Me;

/** 登録・ログイン・更新の結果。リフレッシュトークンは生の値で、Cookie に入れるのは呼び出し側（Controller）。 */
public record AuthResult(String accessToken, String refreshToken, Me me) {
}

package com.tkmedia.raisetimeline.dto;

/** 登録・ログイン・更新の応答の本文。リフレッシュトークンは本文に入れず、Cookie で返す。 */
public record AuthResponse(String accessToken, Me user) {
}

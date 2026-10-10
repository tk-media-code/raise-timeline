package com.tkmedia.raisetimeline.dto;

import com.tkmedia.raisetimeline.validation.NoNul;
import jakarta.validation.constraints.NotBlank;

/** 退会の要求。他人が端末を触っただけでは退会できないよう、パスワードの再入力を求める。 */
public record WithdrawRequest(
		@NotBlank(message = "入力してください") @NoNul String password) {
}

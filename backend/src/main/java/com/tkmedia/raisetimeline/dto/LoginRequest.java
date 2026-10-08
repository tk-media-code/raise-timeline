package com.tkmedia.raisetimeline.dto;

import com.tkmedia.raisetimeline.validation.NoNul;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
		@NotBlank(message = "入力してください") @NoNul String email,
		@NotBlank(message = "入力してください") @NoNul String password) {
}

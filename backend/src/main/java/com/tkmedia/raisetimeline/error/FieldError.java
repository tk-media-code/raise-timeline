package com.tkmedia.raisetimeline.error;

/** 入力項目ごとの誤り。{@code field} は要求の JSON のキー名、{@code message} は画面にそのまま出せる日本語。 */
public record FieldError(String field, String message) {
}

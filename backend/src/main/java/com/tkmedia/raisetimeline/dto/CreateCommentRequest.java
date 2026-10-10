package com.tkmedia.raisetimeline.dto;

/**
 * コメントを書く要求。{@code body} に注釈は付けない。{@code @NotBlank} は {@code trim()} で空を判定するので、
 * 全角空白だけの本文を通してしまう。検査は {@code CommentBodyRules} に集める。
 */
public record CreateCommentRequest(String body) {
}

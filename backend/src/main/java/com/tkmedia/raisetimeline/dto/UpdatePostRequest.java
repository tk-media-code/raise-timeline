package com.tkmedia.raisetimeline.dto;

/**
 * 投稿の編集の入力。{@code body} の検査はサービス（{@code PostBodyRules}）が行う。
 * 注釈で検査しないのは、他人の投稿なら本文が不正でも 403 を返す順序（404、403、422）を守るため。
 * {@code null} や欠けた項目は、空の本文と同じに扱う。
 */
public record UpdatePostRequest(String body) {
}

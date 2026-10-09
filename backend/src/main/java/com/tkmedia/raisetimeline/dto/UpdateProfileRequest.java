package com.tkmedia.raisetimeline.dto;

import com.tkmedia.raisetimeline.validation.CodePointSize;
import com.tkmedia.raisetimeline.validation.NoNul;
import com.tkmedia.raisetimeline.validation.TextRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * プロフィールの更新の入力。部分更新にしない（両方の項目を必ず送る）ので、どちらも欠けたら 422 にする。
 * 欠けた自己紹介を空として扱うと、表示名だけを直したつもりの人の自己紹介が黙って消えてしまう。
 *
 * <p>検証は正規化のあとに行う。表示名は登録と同じく前後の空白を除く。自己紹介は CRLF を LF に直してから数え
 * （画面の数え方と、保存する値をそろえる）、空白と改行だけなら空文字にする（投稿の本文とそろえる）。
 * それ以外の自己紹介は、前後の空白も入力のまま残す。
 */
public record UpdateProfileRequest(
		@NotBlank(message = "1〜50 文字で入力してください")
		@CodePointSize(min = 1, max = 50, message = "1〜50 文字で入力してください")
		@NoNul
		String displayName,
		@NotNull(message = "自己紹介の項目がありません")
		@CodePointSize(max = 160, message = "160 文字以内で入力してください")
		@NoNul
		String bio) {

	/** {@code strip()} は Unicode の空白を除く。{@code trim()} は NUL も消してしまうので使わない（NUL は検証で弾く）。 */
	public UpdateProfileRequest {
		if (displayName != null) {
			displayName = displayName.strip();
		}
		if (bio != null) {
			bio = TextRules.normalizeNewlines(bio);
			if (bio.strip().isEmpty()) {
				bio = "";
			}
		}
	}

}

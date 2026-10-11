package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.image.ImageStorage;

/**
 * 利用者の一覧の 1 行（{@link UserCardRow}）を応答の {@link UserCard} にする。
 * いいねした人・フォロワー・フォロー中が同じ変換をするよう、ここ 1 か所に置く。
 */
final class UserCards {

	private UserCards() {
	}

	/** アイコンの URL は {@link AvatarUrls} で作る（キーが null なら null）。{@code cursorId} は応答に出さない。 */
	static UserCard of(UserCardRow row, ImageStorage imageStorage) {
		return new UserCard(row.userId(), row.username(), row.displayName(),
				AvatarUrls.of(imageStorage, row.avatarKey()), row.bio(), row.isFollowing());
	}

}

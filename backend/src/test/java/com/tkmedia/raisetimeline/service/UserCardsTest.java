package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.image.ImageStorage;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserCardsTest {

	private static final UUID CURSOR_ID = UUID.fromString("0199b000-0000-7000-8000-0000000001a1");
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-0000000002a1");

	private final ImageStorage imageStorage = mock(ImageStorage.class);

	private static UserCardRow row(String avatarKey, boolean isFollowing) {
		return new UserCardRow(CURSOR_ID, USER_ID, "hanako", "花子", avatarKey, "自己紹介\nです", isFollowing);
	}

	@Test
	@DisplayName("行の値を UserCard に写す。id は userId で、cursorId は写さない")
	void copiesRowValues() {
		when(imageStorage.urlOf("avatars/a.png")).thenReturn("https://images.test/avatars/a.png");

		UserCard card = UserCards.of(row("avatars/a.png", true), imageStorage);

		assertThat(card).isEqualTo(new UserCard(USER_ID, "hanako", "花子", "https://images.test/avatars/a.png",
				"自己紹介\nです", true));
	}

	@Test
	@DisplayName("アイコンのキーが null なら avatarUrl は null で、保存先は呼ばない")
	void nullAvatarKeyGivesNullUrl() {
		UserCard card = UserCards.of(row(null, false), imageStorage);

		assertThat(card.avatarUrl()).isNull();
		assertThat(card.isFollowing()).isFalse();
		verifyNoInteractions(imageStorage);
	}

}

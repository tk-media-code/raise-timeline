package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserSearchServiceTest {

	private static final UUID VIEWER = UUID.fromString("0199b000-0000-7000-8000-000000000009");
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000c1");

	private final UserMapper userMapper = mock(UserMapper.class);
	private final UserSearchService service = new UserSearchService(userMapper, new InMemoryImageStorage());

	private static UserCardRow card(int n, boolean isFollowing) {
		return new UserCardRow(UUID.fromString("0199b000-0000-7000-8000-0000000001%02d".formatted(n)),
				UUID.fromString("0199b000-0000-7000-8000-0000000002%02d".formatted(n)),
				"user_" + n, "表示名" + n, null, "自己紹介" + n, isFollowing);
	}

	private static List<UserCardRow> cards(int count) {
		List<UserCardRow> rows = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			rows.add(card(i, false));
		}
		return rows;
	}

	@Test
	@DisplayName("前後の空白を除いてエスケープした語で、limit + 1 件を引く")
	void searchesWithEscapedPatternAndOneExtraRow() {
		when(userMapper.search("%a\\%b%", VIEWER, CURSOR, 21)).thenReturn(List.of());

		PageResponse<UserCard> page = service.search(VIEWER, " a%b ", CURSOR, 20);

		assertThat(page.items()).isEmpty();
		assertThat(page.nextCursor()).isNull();
		verify(userMapper).search("%a\\%b%", VIEWER, CURSOR, 21);
	}

	@Test
	@DisplayName("limit を超えた分は返さず、nextCursor は最後に返す人の id")
	void dropsExtraRowAndPointsAtLastReturned() {
		List<UserCardRow> rows = cards(4);
		when(userMapper.search("%ali%", VIEWER, null, 4)).thenReturn(rows);

		PageResponse<UserCard> page = service.search(VIEWER, "ali", null, 3);

		assertThat(page.items()).extracting(UserCard::id)
				.containsExactly(rows.get(0).userId(), rows.get(1).userId(), rows.get(2).userId());
		assertThat(page.nextCursor()).isEqualTo(rows.get(2).cursorId());
	}

	@Test
	@DisplayName("limit 以下なら全部返し、nextCursor は null")
	void lastPageHasNoNextCursor() {
		when(userMapper.search("%ali%", VIEWER, null, 4)).thenReturn(cards(3));

		PageResponse<UserCard> page = service.search(VIEWER, "ali", null, 3);

		assertThat(page.items()).hasSize(3);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("行の isFollowing がそのまま出る")
	void carriesIsFollowing() {
		when(userMapper.search("%ali%", VIEWER, null, 21))
				.thenReturn(List.of(card(0, true), card(1, false)));

		PageResponse<UserCard> page = service.search(VIEWER, "ali", null, 20);

		assertThat(page.items()).extracting(UserCard::isFollowing).containsExactly(true, false);
	}

	@Test
	@DisplayName("検証に落ちたら Mapper を呼ばない")
	void invalidQueryNeverReachesMapper() {
		assertThatThrownBy(() -> service.search(VIEWER, "  ", null, 20)).isInstanceOf(ValidationException.class);

		verifyNoInteractions(userMapper);
	}

}

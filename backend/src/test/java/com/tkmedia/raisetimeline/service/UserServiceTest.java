package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserServiceTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final OffsetDateTime CREATED_AT = OffsetDateTime.parse("2026-10-07T00:00:00Z");

	private final UserMapper userMapper = mock(UserMapper.class);
	private final UserService service = new UserService(userMapper);

	@Test
	@DisplayName("利用者がいなければ NotFoundException を投げる")
	void getMeThrowsNotFoundWhenMissing() {
		when(userMapper.findById(USER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.getMe(USER_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("getMe は保存された利用者を Me にして返す")
	void getMeReturnsStoredUser() {
		when(userMapper.findById(USER_ID)).thenReturn(Optional.of(user()));

		Me me = service.getMe(USER_ID);

		assertThat(me.id()).isEqualTo(USER_ID);
		assertThat(me.username()).isEqualTo("alice");
		assertThat(me.email()).isEqualTo("alice@example.com");
		assertThat(me.createdAt()).isEqualTo(CREATED_AT);
	}

	@Test
	@DisplayName("toMe はフォロー数 0・isFollowing false・avatarUrl null・isMe true の暫定値を入れる")
	void toMeUsesInterimValues() {
		Me me = service.toMe(user());

		assertThat(me.followersCount()).isZero();
		assertThat(me.followingCount()).isZero();
		assertThat(me.isFollowing()).isFalse();
		assertThat(me.avatarUrl()).isNull();
		assertThat(me.isMe()).isTrue();
		assertThat(me.displayName()).isEqualTo("アリス");
		assertThat(me.bio()).isEmpty();
	}

	private static User user() {
		return new User(USER_ID, "alice", "アリス", "alice@example.com", "$2a$10$hash", "", null, CREATED_AT,
				CREATED_AT);
	}

}

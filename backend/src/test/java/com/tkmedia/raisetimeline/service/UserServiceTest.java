package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.dto.UpdateProfileRequest;
import com.tkmedia.raisetimeline.dto.UserDetail;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class UserServiceTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final OffsetDateTime CREATED_AT = OffsetDateTime.parse("2026-10-07T00:00:00Z");

	private final UserMapper userMapper = mock(UserMapper.class);
	private static final Instant NOW = Instant.parse("2026-10-09T10:00:00Z");

	private final UserService service = new UserService(userMapper, new InMemoryImageStorage(),
			Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	@DisplayName("getMe は利用者がいなければ 401（UnauthenticatedException）")
	void getMeThrowsUnauthenticatedWhenMissing() {
		when(userMapper.findById(USER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.getMe(USER_ID)).isInstanceOf(UnauthenticatedException.class);
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
	@DisplayName("toMe はフォロー数 0・isFollowing false・isMe true の暫定値を入れ、アイコンが無ければ avatarUrl は null")
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

	@Test
	@DisplayName("本人のプロフィールは isMe true。フォロー状態・数は暫定値で、アイコンが無ければ avatarUrl は null")
	void profileOfSelf() {
		when(userMapper.findByUsername("alice")).thenReturn(Optional.of(user()));

		UserDetail detail = service.getProfile("alice", USER_ID);

		assertThat(detail.id()).isEqualTo(USER_ID);
		assertThat(detail.isMe()).isTrue();
		assertThat(detail.isFollowing()).isFalse();
		assertThat(detail.followersCount()).isZero();
		assertThat(detail.followingCount()).isZero();
		assertThat(detail.avatarUrl()).isNull();
		assertThat(detail.createdAt()).isEqualTo(CREATED_AT);
	}

	@Test
	@DisplayName("他人のプロフィールは isMe false")
	void profileOfOther() {
		when(userMapper.findByUsername("alice")).thenReturn(Optional.of(user()));

		UserDetail detail = service.getProfile("alice", UUID.fromString("0199b000-0000-7000-8000-000000000002"));

		assertThat(detail.isMe()).isFalse();
		assertThat(detail.username()).isEqualTo("alice");
		assertThat(detail.displayName()).isEqualTo("アリス");
	}

	@Test
	@DisplayName("いない利用者のプロフィールは NotFoundException")
	void profileOfMissingUser() {
		when(userMapper.findByUsername("ghost")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.getProfile("ghost", USER_ID)).isInstanceOf(NotFoundException.class);
	}

	@ParameterizedTest(name = "[{index}] {0}")
	@MethodSource("com.tkmedia.raisetimeline.validation.UsernamesTest#malformedValues")
	@DisplayName("規則に合わない名前は、DB に問い合わせずに NotFoundException")
	void malformedUsernameIsNotFoundWithoutQuery(String username) {
		assertThatThrownBy(() -> service.requireByUsername(username)).isInstanceOf(NotFoundException.class);

		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("名前が null でも、DB に問い合わせずに NotFoundException")
	void nullUsernameIsNotFoundWithoutQuery() {
		assertThatThrownBy(() -> service.requireByUsername(null)).isInstanceOf(NotFoundException.class);

		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("updateProfile は Clock の時刻で更新し、RETURNING の行から email 付きの Me を作る")
	void updateProfileUsesClock() {
		OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
		User updated = new User(USER_ID, "alice", "新しい名前", "alice@example.com", "$2a$10$hash", "新しい自己紹介", null,
				CREATED_AT, now);
		when(userMapper.updateProfile(USER_ID, "新しい名前", "新しい自己紹介", now)).thenReturn(Optional.of(updated));

		Me me = service.updateProfile(USER_ID, new UpdateProfileRequest("新しい名前", "新しい自己紹介"));

		verify(userMapper).updateProfile(USER_ID, "新しい名前", "新しい自己紹介", now);
		verify(userMapper, never()).findById(any());
		assertThat(me.displayName()).isEqualTo("新しい名前");
		assertThat(me.bio()).isEqualTo("新しい自己紹介");
		assertThat(me.email()).isEqualTo("alice@example.com");
		assertThat(me.isMe()).isTrue();
	}

	@Test
	@DisplayName("updateProfile は行が無ければ 401（UnauthenticatedException）で、findById を呼ばない")
	void updateProfileOfGoneUser() {
		when(userMapper.updateProfile(USER_ID, "アリス", "", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC)))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.updateProfile(USER_ID, new UpdateProfileRequest("アリス", "")))
				.isInstanceOf(UnauthenticatedException.class);
		verify(userMapper, never()).findById(any());
	}

	@Test
	@DisplayName("avatarKey のある利用者は、Me と UserDetail に保存先の URL が入る")
	void avatarUrlIsBuiltFromKey() {
		User withAvatar = new User(USER_ID, "alice", "アリス", "alice@example.com", "$2a$10$hash", "",
				"avatars/" + USER_ID + "/a.png", CREATED_AT, CREATED_AT);

		assertThat(service.toMe(withAvatar).avatarUrl())
				.isEqualTo("https://images.test/avatars/" + USER_ID + "/a.png");
		assertThat(service.toDetail(withAvatar, USER_ID).avatarUrl())
				.isEqualTo("https://images.test/avatars/" + USER_ID + "/a.png");
	}

	private static User user() {
		return new User(USER_ID, "alice", "アリス", "alice@example.com", "$2a$10$hash", "", null, CREATED_AT,
				CREATED_AT);
	}

}

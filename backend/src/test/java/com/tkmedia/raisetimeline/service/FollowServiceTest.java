package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.FollowMapper;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class FollowServiceTest {

	private static final UUID ME = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID TARGET = UUID.fromString("0199b000-0000-7000-8000-000000000002");
	private static final UUID VIEWER = UUID.fromString("0199b000-0000-7000-8000-000000000009");
	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-11T00:00:00Z");

	private final FollowMapper followMapper = mock(FollowMapper.class);
	private final UserService userService = mock(UserService.class);
	private final FollowService service = new FollowService(followMapper, userService, new InMemoryImageStorage());

	private static DataIntegrityViolationException violation(String constraint) {
		return new DataIntegrityViolationException("x", new SQLException(
				"insert or update on table \"follows\" violates foreign key constraint \"" + constraint + "\""));
	}

	private static User user(UUID id, String username) {
		return new User(id, username, "表示名", username + "@example.com", "hash", "", null, NOW, NOW);
	}

	private static UserCardRow card(int n) {
		return new UserCardRow(UUID.fromString("0199b000-0000-7000-8000-0000000001%02d".formatted(n)),
				UUID.fromString("0199b000-0000-7000-8000-0000000002%02d".formatted(n)),
				"user_" + n, "表示名" + n, null, "自己紹介" + n, false);
	}

	private static List<UserCardRow> cards(int count) {
		List<UserCardRow> rows = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			rows.add(card(i));
		}
		return rows;
	}

	@Test
	@DisplayName("follow は名前で相手を引き、insert(me, 相手の id) を呼ぶ。0 行（すでにフォロー済み）でも例外にしない")
	void followInsertsByName() {
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.insert(ME, TARGET)).thenReturn(0);

		assertThatCode(() -> service.follow(ME, "alice")).doesNotThrowAnyException();

		verify(followMapper).insert(ME, TARGET);
	}

	@Test
	@DisplayName("follow は相手が居なければ NotFoundException で、insert は呼ばない")
	void followMissingUser() {
		when(userService.requireByUsername("ghost")).thenThrow(new NotFoundException());

		assertThatThrownBy(() -> service.follow(ME, "ghost")).isInstanceOf(NotFoundException.class);

		verify(followMapper, never()).insert(any(), any());
	}

	@Test
	@DisplayName("follow は自分自身なら ValidationException（field は username、文言は 自分自身はフォローできません）で、insert は呼ばない")
	void followSelf() {
		when(userService.requireByUsername("me")).thenReturn(user(ME, "me"));

		assertThatThrownBy(() -> service.follow(ME, "me"))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).containsExactly(new FieldError("username", "自分自身はフォローできません")));

		verify(followMapper, never()).insert(any(), any());
	}

	@Test
	@DisplayName("follows_followee_id_fkey の違反は NotFoundException")
	void followTranslatesFolloweeForeignKey() {
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.insert(ME, TARGET)).thenThrow(violation("follows_followee_id_fkey"));

		assertThatThrownBy(() -> service.follow(ME, "alice")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("follows_follower_id_fkey の違反は UnauthenticatedException")
	void followTranslatesFollowerForeignKey() {
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.insert(ME, TARGET)).thenThrow(violation("follows_follower_id_fkey"));

		assertThatThrownBy(() -> service.follow(ME, "alice")).isInstanceOf(UnauthenticatedException.class);
	}

	@Test
	@DisplayName("知らない制約の違反は、同じ例外をそのまま投げる")
	void followRethrowsUnknownViolation() {
		DataIntegrityViolationException other = violation("follows_something_else_fkey");
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.insert(ME, TARGET)).thenThrow(other);

		assertThatThrownBy(() -> service.follow(ME, "alice")).isSameAs(other);
	}

	@Test
	@DisplayName("unfollow は delete(me, 相手の id) を呼ぶ。0 行でも例外にしない")
	void unfollowDeletes() {
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.delete(ME, TARGET)).thenReturn(0);

		assertThatCode(() -> service.unfollow(ME, "alice")).doesNotThrowAnyException();

		verify(followMapper).delete(ME, TARGET);
	}

	@Test
	@DisplayName("unfollow は自分を指しても例外にしない")
	void unfollowSelfIsNotAnError() {
		when(userService.requireByUsername("me")).thenReturn(user(ME, "me"));

		assertThatCode(() -> service.unfollow(ME, "me")).doesNotThrowAnyException();

		verify(followMapper).delete(ME, ME);
	}

	@Test
	@DisplayName("unfollow は相手が居なければ NotFoundException で、delete は呼ばない")
	void unfollowMissingUser() {
		when(userService.requireByUsername("ghost")).thenThrow(new NotFoundException());

		assertThatThrownBy(() -> service.unfollow(ME, "ghost")).isInstanceOf(NotFoundException.class);

		verify(followMapper, never()).delete(any(), any());
	}

	@Test
	@DisplayName("followers は相手が居なければ NotFoundException で、findFollowers は呼ばない")
	void followersMissingUser() {
		when(userService.requireByUsername("ghost")).thenThrow(new NotFoundException());

		assertThatThrownBy(() -> service.followers(VIEWER, "ghost", null, 20)).isInstanceOf(NotFoundException.class);

		verify(followMapper, never()).findFollowers(any(), any(), any(), anyInt());
	}

	@Test
	@DisplayName("following は相手が居なければ NotFoundException で、findFollowing は呼ばない")
	void followingMissingUser() {
		when(userService.requireByUsername("ghost")).thenThrow(new NotFoundException());

		assertThatThrownBy(() -> service.following(VIEWER, "ghost", null, 20)).isInstanceOf(NotFoundException.class);

		verify(followMapper, never()).findFollowing(any(), any(), any(), anyInt());
	}

	@Test
	@DisplayName("followers は findFollowers(相手の id, viewer, cursor, limit + 1) を読み、limit を超えた分は返さず、nextCursor は返す最後の行の cursorId")
	void followersCutsExtraRow() {
		UUID cursor = UUID.fromString("0199b000-0000-7000-8000-0000000009ff");
		List<UserCardRow> rows = cards(3);
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.findFollowers(TARGET, VIEWER, cursor, 3)).thenReturn(rows);

		PageResponse<UserCard> page = service.followers(VIEWER, "alice", cursor, 2);

		assertThat(page.items()).extracting(UserCard::id).containsExactly(rows.get(0).userId(), rows.get(1).userId());
		assertThat(page.nextCursor()).isEqualTo(rows.get(1).cursorId());
	}

	@Test
	@DisplayName("followers は limit を超えなければ nextCursor が null")
	void followersLastPage() {
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.findFollowers(TARGET, VIEWER, null, 3)).thenReturn(cards(2));

		PageResponse<UserCard> page = service.followers(VIEWER, "alice", null, 2);

		assertThat(page.items()).hasSize(2);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("following も同じ規則で findFollowing を読む")
	void followingCutsExtraRow() {
		List<UserCardRow> rows = cards(3);
		when(userService.requireByUsername("alice")).thenReturn(user(TARGET, "alice"));
		when(followMapper.findFollowing(TARGET, VIEWER, null, 3)).thenReturn(rows);

		PageResponse<UserCard> page = service.following(VIEWER, "alice", null, 2);

		assertThat(page.items()).extracting(UserCard::id).containsExactly(rows.get(0).userId(), rows.get(1).userId());
		assertThat(page.nextCursor()).isEqualTo(rows.get(1).cursorId());
		verify(followMapper, never()).findFollowers(any(), any(), any(), anyInt());
	}

}

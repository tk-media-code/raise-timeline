package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.LikeMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.dao.DataIntegrityViolationException;

class LikeServiceTest {

	private static final UUID ME = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID VIEWER = UUID.fromString("0199b000-0000-7000-8000-000000000009");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");

	private final LikeMapper likeMapper = mock(LikeMapper.class);
	private final PostMapper postMapper = mock(PostMapper.class);
	private final LikeService service = new LikeService(likeMapper, postMapper, new InMemoryImageStorage());

	private static DataIntegrityViolationException violation(String constraint) {
		return new DataIntegrityViolationException("x", new SQLException(
				"insert or update on table \"likes\" violates foreign key constraint \"" + constraint + "\""));
	}

	private static UserCardRow liker(int n, String avatarKey, boolean isFollowing) {
		return new UserCardRow(UUID.fromString("0199b000-0000-7000-8000-0000000001%02d".formatted(n)),
				UUID.fromString("0199b000-0000-7000-8000-0000000002%02d".formatted(n)),
				"user_" + n, "表示名" + n, avatarKey, "自己紹介\n" + n,
				isFollowing);
	}

	private static List<UserCardRow> likers(int count) {
		List<UserCardRow> rows = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			rows.add(liker(i, null, false));
		}
		return rows;
	}

	@Test
	@DisplayName("付けると likeMapper.insert(postId, me) を呼ぶ。0 行（既に付けていた）でも例外にしない")
	void likeInserts() {
		when(likeMapper.insert(POST_ID, ME)).thenReturn(0);

		assertThatCode(() -> service.like(ME, POST_ID)).doesNotThrowAnyException();

		verify(likeMapper).insert(POST_ID, ME);
	}

	@Test
	@DisplayName("付けるときは投稿の存在を先に確かめない（postMapper を呼ばない）")
	void likeDoesNotCheckPostBeforehand() {
		service.like(ME, POST_ID);

		verifyNoInteractions(postMapper);
	}

	@Test
	@DisplayName("likes_post_id_fkey の違反は NotFoundException")
	void likeTranslatesPostForeignKey() {
		when(likeMapper.insert(POST_ID, ME)).thenThrow(violation("likes_post_id_fkey"));

		assertThatThrownBy(() -> service.like(ME, POST_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("likes_user_id_fkey の違反は UnauthenticatedException")
	void likeTranslatesUserForeignKey() {
		when(likeMapper.insert(POST_ID, ME)).thenThrow(violation("likes_user_id_fkey"));

		assertThatThrownBy(() -> service.like(ME, POST_ID)).isInstanceOf(UnauthenticatedException.class);
	}

	@Test
	@DisplayName("知らない制約の違反は、同じ例外をそのまま投げる")
	void likeRethrowsUnknownViolation() {
		DataIntegrityViolationException other = violation("likes_something_else_fkey");
		when(likeMapper.insert(POST_ID, ME)).thenThrow(other);

		assertThatThrownBy(() -> service.like(ME, POST_ID)).isSameAs(other);
	}

	@Test
	@DisplayName("外すとき、投稿が無ければ NotFoundException で、delete は呼ばない")
	void unlikeMissingPost() {
		when(postMapper.existsById(POST_ID)).thenReturn(false);

		assertThatThrownBy(() -> service.unlike(ME, POST_ID)).isInstanceOf(NotFoundException.class);

		verify(likeMapper, never()).delete(ArgumentMatchers.any(), ArgumentMatchers.any());
	}

	@Test
	@DisplayName("外すとき、投稿があれば delete(postId, me) を呼ぶ。0 行でも例外にしない")
	void unlikeDeletes() {
		when(postMapper.existsById(POST_ID)).thenReturn(true);
		when(likeMapper.delete(POST_ID, ME)).thenReturn(0);

		assertThatCode(() -> service.unlike(ME, POST_ID)).doesNotThrowAnyException();

		verify(likeMapper).delete(POST_ID, ME);
	}

	@Test
	@DisplayName("一覧で、投稿が無ければ NotFoundException で、findLikers は呼ばない")
	void likersMissingPost() {
		when(postMapper.existsById(POST_ID)).thenReturn(false);

		assertThatThrownBy(() -> service.likers(VIEWER, POST_ID, null, 20)).isInstanceOf(NotFoundException.class);

		verify(likeMapper, never()).findLikers(ArgumentMatchers.any(), ArgumentMatchers.any(),
				ArgumentMatchers.any(), ArgumentMatchers.anyInt());
	}

	@Test
	@DisplayName("一覧は limit + 1 行を読む。limit を超えた分は返さず、nextCursor は返す最後の行の cursorId")
	void likersCutsExtraRow() {
		UUID cursor = UUID.fromString("0199b000-0000-7000-8000-0000000009ff");
		List<UserCardRow> rows = likers(3);
		when(postMapper.existsById(POST_ID)).thenReturn(true);
		when(likeMapper.findLikers(POST_ID, VIEWER, cursor, 3)).thenReturn(rows);

		PageResponse<UserCard> page = service.likers(VIEWER, POST_ID, cursor, 2);

		assertThat(page.items()).extracting(UserCard::id).containsExactly(rows.get(0).userId(), rows.get(1).userId());
		assertThat(page.nextCursor()).isEqualTo(rows.get(1).cursorId());
	}

	@Test
	@DisplayName("limit を超えなければ nextCursor は null")
	void likersLastPage() {
		when(postMapper.existsById(POST_ID)).thenReturn(true);
		when(likeMapper.findLikers(POST_ID, VIEWER, null, 3)).thenReturn(likers(2));

		PageResponse<UserCard> page = service.likers(VIEWER, POST_ID, null, 2);

		assertThat(page.items()).hasSize(2);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("各行の avatarUrl は保存先が作る URL（avatarKey が null なら null）、bio と isFollowing はそのまま")
	void likersMapsCards() {
		UserCardRow withAvatar = liker(1, "avatars/a.png", true);
		UserCardRow withoutAvatar = liker(2, null, false);
		when(postMapper.existsById(POST_ID)).thenReturn(true);
		when(likeMapper.findLikers(POST_ID, VIEWER, null, 21)).thenReturn(List.of(withAvatar, withoutAvatar));

		List<UserCard> items = service.likers(VIEWER, POST_ID, null, 20).items();

		assertThat(items.get(0)).isEqualTo(new UserCard(withAvatar.userId(), "user_1", "表示名1",
				"https://images.test/avatars/a.png", "自己紹介\n1", true));
		assertThat(items.get(1).avatarUrl()).isNull();
		assertThat(items.get(1).bio()).isEqualTo("自己紹介\n2");
		assertThat(items.get(1).isFollowing()).isFalse();
	}

}

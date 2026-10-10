package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.CommentWithAuthor;
import com.tkmedia.raisetimeline.dto.CommentResponse;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.CommentMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class CommentServiceTest {

	private static final UUID ME = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID OTHER = UUID.fromString("0199b000-0000-7000-8000-000000000002");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final UUID COMMENT_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000c1");
	private static final Instant NOW_INSTANT = Instant.parse("2026-10-11T01:02:03Z");
	private static final OffsetDateTime NOW = OffsetDateTime.ofInstant(NOW_INSTANT, ZoneOffset.UTC);

	private final CommentMapper commentMapper = mock(CommentMapper.class);
	private final PostMapper postMapper = mock(PostMapper.class);
	private final InMemoryImageStorage storage = new InMemoryImageStorage();
	private final CommentService service = new CommentService(commentMapper, postMapper, storage,
			Clock.fixed(NOW_INSTANT, ZoneOffset.UTC));

	private static CommentWithAuthor row(UUID id, UUID author, String body, String avatarKey) {
		return new CommentWithAuthor(id, POST_ID, author, body, NOW, "taro_1", "太郎", avatarKey);
	}

	private static DataIntegrityViolationException violation(String constraint) {
		return new DataIntegrityViolationException("x", new SQLException(
				"insert or update on table \"comments\" violates foreign key constraint \"" + constraint + "\""));
	}

	@Test
	@DisplayName("create は正規化した本文で insert(postId, me, 本文, 今) し、findById の結果を組み立てて返す")
	void createInsertsNormalizedBody() {
		when(commentMapper.insert(POST_ID, ME, "一\n二", NOW)).thenReturn(COMMENT_ID);
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.of(row(COMMENT_ID, ME, "一\n二", null)));

		CommentResponse response = service.create(ME, POST_ID, "一\r\n二");

		verify(commentMapper).insert(POST_ID, ME, "一\n二", NOW);
		assertThat(response).isEqualTo(new CommentResponse(COMMENT_ID, new UserSummary(ME, "taro_1", "太郎", null),
				"一\n二", NOW));
	}

	@Test
	@DisplayName("アイコンのキーがあれば avatarUrl は保存先が作る URL、null なら null")
	void avatarUrlComesFromStorage() {
		when(commentMapper.insert(any(), any(), any(), any())).thenReturn(COMMENT_ID);
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.of(row(COMMENT_ID, ME, "本文", "avatars/a.png")));

		CommentResponse withKey = service.create(ME, POST_ID, "本文");

		assertThat(withKey.author().avatarUrl()).isEqualTo(storage.urlOf("avatars/a.png"));

		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.of(row(COMMENT_ID, ME, "本文", null)));

		assertThat(service.create(ME, POST_ID, "本文").author().avatarUrl()).isNull();
	}

	@Test
	@DisplayName("create は本文が不正なら ValidationException（field は body）で、insert は呼ばない")
	void createRejectsInvalidBody() {
		assertThatThrownBy(() -> service.create(ME, POST_ID, "　"))
				.isInstanceOfSatisfying(ValidationException.class, e -> assertThat(e.errors())
						.containsExactly(new FieldError("body", "1〜280 文字で入力してください")));

		verifyNoInteractions(commentMapper);
	}

	@Test
	@DisplayName("create は投稿の外部キー違反（comments_post_id_fkey）を NotFoundException にする")
	void createTranslatesPostForeignKeyViolation() {
		when(commentMapper.insert(any(), any(), any(), any())).thenThrow(violation("comments_post_id_fkey"));

		assertThatThrownBy(() -> service.create(ME, POST_ID, "本文")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("create は利用者の外部キー違反（comments_user_id_fkey）を UnauthenticatedException にする")
	void createTranslatesUserForeignKeyViolation() {
		when(commentMapper.insert(any(), any(), any(), any())).thenThrow(violation("comments_user_id_fkey"));

		assertThatThrownBy(() -> service.create(ME, POST_ID, "本文")).isInstanceOf(UnauthenticatedException.class);
	}

	@Test
	@DisplayName("create は知らない制約の違反を変換せず、同じ例外のまま投げる")
	void createRethrowsUnknownConstraint() {
		DataIntegrityViolationException other = violation("comments_something_else_fkey");
		when(commentMapper.insert(any(), any(), any(), any())).thenThrow(other);

		assertThatThrownBy(() -> service.create(ME, POST_ID, "本文")).isSameAs(other);
	}

	@Test
	@DisplayName("create は insert のあと findById が空なら NotFoundException")
	void createFailsWhenRowVanishes() {
		when(commentMapper.insert(any(), any(), any(), any())).thenReturn(COMMENT_ID);
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.create(ME, POST_ID, "本文")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("list は投稿が無ければ NotFoundException で、findByPost は呼ばない")
	void listMissingPost() {
		when(postMapper.existsById(POST_ID)).thenReturn(false);

		assertThatThrownBy(() -> service.list(POST_ID, null, 20)).isInstanceOf(NotFoundException.class);

		verify(commentMapper, never()).findByPost(any(), any(), anyInt());
	}

	private static List<CommentWithAuthor> rows(int count) {
		List<CommentWithAuthor> rows = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			UUID id = UUID.fromString(String.format("0199b000-0000-7000-8000-%012d", 1000 - i));
			rows.add(row(id, OTHER, "本文" + i, null));
		}
		return rows;
	}

	@Test
	@DisplayName("list は limit + 1 行を読み、limit を超えた分は返さず、nextCursor は返す最後の行の id")
	void listCutsOffExtraRow() {
		List<CommentWithAuthor> rows = rows(3);
		when(postMapper.existsById(POST_ID)).thenReturn(true);
		when(commentMapper.findByPost(POST_ID, COMMENT_ID, 3)).thenReturn(rows);

		PageResponse<CommentResponse> page = service.list(POST_ID, COMMENT_ID, 2);

		verify(commentMapper).findByPost(POST_ID, COMMENT_ID, 3);
		assertThat(page.items()).extracting(CommentResponse::id).containsExactly(rows.get(0).id(), rows.get(1).id());
		assertThat(page.nextCursor()).isEqualTo(rows.get(1).id());
	}

	@Test
	@DisplayName("list は limit 行以下なら全部返し、nextCursor は null")
	void listWithoutMore() {
		List<CommentWithAuthor> rows = rows(2);
		when(postMapper.existsById(POST_ID)).thenReturn(true);
		when(commentMapper.findByPost(POST_ID, null, 3)).thenReturn(rows);

		PageResponse<CommentResponse> page = service.list(POST_ID, null, 2);

		assertThat(page.items()).hasSize(2);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("delete は無い id で NotFoundException")
	void deleteMissing() {
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.delete(ME, COMMENT_ID)).isInstanceOf(NotFoundException.class);

		verify(commentMapper, never()).delete(any());
	}

	@Test
	@DisplayName("delete は他人のコメントで ForbiddenException で、commentMapper.delete は呼ばない")
	void deleteOthers() {
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.of(row(COMMENT_ID, OTHER, "本文", null)));

		assertThatThrownBy(() -> service.delete(ME, COMMENT_ID)).isInstanceOf(ForbiddenException.class);

		verify(commentMapper, never()).delete(any());
	}

	@Test
	@DisplayName("delete は消した行数が 0 なら NotFoundException")
	void deleteZeroRows() {
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.of(row(COMMENT_ID, ME, "本文", null)));
		when(commentMapper.delete(COMMENT_ID)).thenReturn(0);

		assertThatThrownBy(() -> service.delete(ME, COMMENT_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("delete は本人のコメントを消す")
	void deleteOwn() {
		when(commentMapper.findById(COMMENT_ID)).thenReturn(Optional.of(row(COMMENT_ID, ME, "本文", null)));
		when(commentMapper.delete(COMMENT_ID)).thenReturn(1);

		service.delete(ME, COMMENT_ID);

		verify(commentMapper, times(1)).delete(COMMENT_ID);
	}

}

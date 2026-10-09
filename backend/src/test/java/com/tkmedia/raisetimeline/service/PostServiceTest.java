package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class PostServiceTest {

	private static final UUID ME = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID OTHER = UUID.fromString("0199b000-0000-7000-8000-000000000002");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final Instant NOW_INSTANT = Instant.parse("2026-10-09T01:02:03Z");
	private static final OffsetDateTime NOW = OffsetDateTime.ofInstant(NOW_INSTANT, ZoneOffset.UTC);

	private final PostMapper postMapper = mock(PostMapper.class);
	private final PostService service = new PostService(postMapper, new PostAssembler(),
			Clock.fixed(NOW_INSTANT, ZoneOffset.UTC));

	private static PostWithAuthor row(UUID owner, String body) {
		return new PostWithAuthor(POST_ID, owner, body, NOW, NOW, "taro_1", "太郎", null);
	}

	private static DataIntegrityViolationException violation(String constraint) {
		return new DataIntegrityViolationException("x", new SQLException(
				"insert or update on table \"posts\" violates foreign key constraint \"" + constraint + "\""));
	}

	@Test
	@DisplayName("create は正規化した本文で insert し、findById の結果を組み立てて返す")
	void createInsertsNormalizedBody() {
		when(postMapper.insert(any())).thenReturn(POST_ID);
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "一行目\n二行目")));

		PostResponse response = service.create(ME, "一行目\r\n二行目");

		verify(postMapper).insert(new Post(null, ME, "一行目\n二行目", NOW, NOW));
		assertThat(response.id()).isEqualTo(POST_ID);
		assertThat(response.body()).isEqualTo("一行目\n二行目");
		assertThat(response.author().username()).isEqualTo("taro_1");
	}

	@Test
	@DisplayName("create は本文が空白だけなら ValidationException で、insert を呼ばない")
	void createRejectsWhitespaceOnly() {
		assertThatThrownBy(() -> service.create(ME, " \n　 ")).isInstanceOf(ValidationException.class);

		verify(postMapper, never()).insert(any());
	}

	@Test
	@DisplayName("create は投稿者の外部キー違反を UnauthenticatedException にする")
	void createTranslatesUserForeignKeyViolation() {
		when(postMapper.insert(any())).thenThrow(violation("posts_user_id_fkey"));

		assertThatThrownBy(() -> service.create(ME, "こんにちは")).isInstanceOf(UnauthenticatedException.class);
	}

	@Test
	@DisplayName("create は別の制約の違反を変換せず、同じ例外のまま投げ直す")
	void createRethrowsUnknownConstraint() {
		DataIntegrityViolationException other = violation("posts_something_else_fkey");
		when(postMapper.insert(any())).thenThrow(other);

		assertThatThrownBy(() -> service.create(ME, "こんにちは")).isSameAs(other);
	}

	@Test
	@DisplayName("get は無い id で NotFoundException")
	void getMissing() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.get(POST_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("get は投稿を応答の形にして返す")
	void getReturnsPost() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人の投稿")));

		assertThat(service.get(POST_ID).body()).isEqualTo("他人の投稿");
	}

	@Test
	@DisplayName("updateBody は無い id で NotFoundException")
	void updateMissing() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "直した")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("updateBody は他人の投稿で ForbiddenException になり、updateBody を呼ばない")
	void updateOthers() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人")));

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "直した")).isInstanceOf(ForbiddenException.class);

		verify(postMapper, never()).updateBody(any(), any(), any());
	}

	@Test
	@DisplayName("updateBody は自分の投稿なら、正規化した本文と now で更新して、読み直した投稿を返す")
	void updateOwn() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "元")))
				.thenReturn(Optional.of(
						new PostWithAuthor(POST_ID, ME, "直した\n本文", NOW, NOW.plusSeconds(5), "taro_1", "太郎", null)));
		when(postMapper.updateBody(POST_ID, "直した\n本文", NOW)).thenReturn(1);

		PostResponse response = service.updateBody(ME, POST_ID, "直した\r\n本文");

		verify(postMapper).updateBody(POST_ID, "直した\n本文", NOW);
		assertThat(response.body()).isEqualTo("直した\n本文");
		assertThat(response.edited()).isTrue();
	}

	@Test
	@DisplayName("updateBody は更新が 0 行なら NotFoundException（読んだ後に消された）")
	void updateAffectsNoRow() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "元")));
		when(postMapper.updateBody(any(), any(), any())).thenReturn(0);

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "直した")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("updateBody の判定は 404、403、422 の順。他人の投稿なら、本文が不正でも 403")
	void updateOrderIs404Then403Then422() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人")));
		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "a\u0000b")).isInstanceOf(ForbiddenException.class);

		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());
		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "a\u0000b")).isInstanceOf(NotFoundException.class);

		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "a\u0000b")).isInstanceOf(ValidationException.class);
		verify(postMapper, never()).updateBody(any(), any(), any());
	}

	@Test
	@DisplayName("delete は無い id で NotFoundException")
	void deleteMissing() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("delete は他人の投稿で ForbiddenException になり、delete を呼ばない")
	void deleteOthers() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人")));

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(ForbiddenException.class);

		verify(postMapper, never()).delete(any());
	}

	@Test
	@DisplayName("delete は自分の投稿なら delete(id) を呼ぶ")
	void deleteOwn() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.delete(POST_ID)).thenReturn(1);

		service.delete(ME, POST_ID);

		verify(postMapper).delete(POST_ID);
	}

	@Test
	@DisplayName("delete は 0 行なら NotFoundException（読んだ後に消された）")
	void deleteAffectsNoRow() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.delete(POST_ID)).thenReturn(0);

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(NotFoundException.class);
	}

}

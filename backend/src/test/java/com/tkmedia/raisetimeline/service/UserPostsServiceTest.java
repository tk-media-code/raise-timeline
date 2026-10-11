package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.CommentMapper;
import com.tkmedia.raisetimeline.mapper.LikeMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserPostsServiceTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 9, 1, 2, 3, 0, ZoneOffset.UTC);
	/** プロフィールの持ち主（一覧に並ぶ投稿を書いた人）。 */
	private static final UUID OWNER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	/** 一覧を見ている人。持ち主と別の id にして、2 つの取り違えを見分けられるようにする。 */
	private static final UUID VIEWER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000002");
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000ff");

	private final UserService userService = mock(UserService.class);
	private final PostMapper postMapper = mock(PostMapper.class);
	private final LikeMapper likeMapper = mock(LikeMapper.class);
	private final UserPostsService service = new UserPostsService(userService, postMapper,
			new PostAssembler(postMapper, likeMapper, mock(CommentMapper.class), new InMemoryImageStorage()));

	private static List<PostWithAuthor> rows(int n) {
		List<PostWithAuthor> rows = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			UUID id = UUID.fromString(String.format("0199b000-0000-7000-8000-%012x", 0x1000 - i));
			rows.add(new PostWithAuthor(id, OWNER_ID, "本文" + i, NOW, NOW, "alice", "アリス", null));
		}
		return rows;
	}

	@Test
	@DisplayName("利用者がいなければ NotFoundException を投げ、投稿は引かない")
	void postsOfMissingUser() {
		when(userService.requireByUsername("ghost")).thenThrow(new NotFoundException());

		assertThatThrownBy(() -> service.postsOf(VIEWER_ID, "ghost", null, 20)).isInstanceOf(NotFoundException.class);

		verifyNoInteractions(postMapper);
	}

	@Test
	@DisplayName("limit より 1 行多く引き、Pages で整えた結果を返す")
	void postsOfUserReadsOneMoreRow() {
		User user = new User(OWNER_ID, "alice", "アリス", "alice@example.com", "hash", "", null, NOW, NOW);
		when(userService.requireByUsername("alice")).thenReturn(user);
		List<PostWithAuthor> rows = rows(21);
		when(postMapper.findByUser(OWNER_ID, CURSOR, 21)).thenReturn(rows);

		PageResponse<PostResponse> page = service.postsOf(VIEWER_ID, "alice", CURSOR, 20);

		verify(postMapper).findByUser(OWNER_ID, CURSOR, 21);
		assertThat(page.items()).hasSize(20);
		assertThat(page.nextCursor()).isEqualTo(rows.get(19).id());
	}

	@Test
	@DisplayName("投稿は持ち主の id で引き、likedByMe は見ている人の id を基準にする")
	void postsAreOfTheOwnerAndLikedByTheViewer() {
		User user = new User(OWNER_ID, "alice", "アリス", "alice@example.com", "hash", "", null, NOW, NOW);
		when(userService.requireByUsername("alice")).thenReturn(user);
		List<PostWithAuthor> rows = rows(2);
		when(postMapper.findByUser(OWNER_ID, null, 21)).thenReturn(rows);
		// 見ている人は 1 件目だけにいいねしている。持ち主の id で引いたときは何も返らない。
		List<UUID> ids = rows.stream().map(PostWithAuthor::id).toList();
		when(likeMapper.findLikedPostIds(VIEWER_ID, ids)).thenReturn(List.of(rows.get(0).id()));

		PageResponse<PostResponse> page = service.postsOf(VIEWER_ID, "alice", null, 20);

		verify(postMapper).findByUser(OWNER_ID, null, 21);
		verify(likeMapper).findLikedPostIds(VIEWER_ID, ids);
		assertThat(page.items()).extracting(PostResponse::likedByMe).containsExactly(true, false);
	}

}

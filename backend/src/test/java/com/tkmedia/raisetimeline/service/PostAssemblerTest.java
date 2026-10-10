package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.PostImage;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostImageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PostAssemblerTest {

	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final OffsetDateTime CREATED = OffsetDateTime.parse("2026-10-09T00:00:00Z");

	private final PostMapper postMapper = mock(PostMapper.class);
	private final PostAssembler assembler = new PostAssembler(postMapper, new InMemoryImageStorage());

	private static PostWithAuthor row(OffsetDateTime updatedAt) {
		return new PostWithAuthor(POST_ID, USER_ID, "本文", CREATED, updatedAt, "taro_1", "太郎", "avatars/x.png");
	}

	private static PostImage image(String id, UUID postId, String key, int position) {
		return new PostImage(UUID.fromString(id), postId, key, position);
	}

	@Test
	@DisplayName("updatedAt が createdAt と同じなら edited は false")
	void notEditedWhenUpdatedAtEqualsCreatedAt() {
		assertThat(assembler.toResponse(row(CREATED)).edited()).isFalse();
	}

	@Test
	@DisplayName("updatedAt が createdAt の 1 秒後なら edited は true")
	void editedWhenUpdatedAtIsLater() {
		assertThat(assembler.toResponse(row(CREATED.plusSeconds(1))).edited()).isTrue();
	}

	@Test
	@DisplayName("avatarKey のある投稿者の avatarUrl は、保存先が作る URL になる")
	void authorHasAvatarUrl() {
		PostResponse response = assembler.toResponse(row(CREATED));

		assertThat(response.author())
				.isEqualTo(new UserSummary(USER_ID, "taro_1", "太郎", "https://images.test/avatars/x.png"));
		assertThat(response.id()).isEqualTo(POST_ID);
		assertThat(response.body()).isEqualTo("本文");
		assertThat(response.createdAt()).isEqualTo(CREATED);
	}

	@Test
	@DisplayName("avatarKey が null の投稿者の avatarUrl は null")
	void authorWithoutAvatarHasNullUrl() {
		PostWithAuthor row = new PostWithAuthor(POST_ID, USER_ID, "本文", CREATED, CREATED, "taro_1", "太郎", null);

		assertThat(assembler.toResponse(row).author().avatarUrl()).isNull();
	}

	@Test
	@DisplayName("いいね・コメントは暫定値: 数は 0、likedByMe は false。画像が無ければ images は空")
	void interimValues() {
		PostResponse response = assembler.toResponse(row(CREATED));

		assertThat(response.images()).isEmpty();
		assertThat(response.likeCount()).isZero();
		assertThat(response.commentCount()).isZero();
		assertThat(response.likedByMe()).isFalse();
	}

	@Test
	@DisplayName("画像は position の順に PostImageResponse(id, url) で並ぶ")
	void imagesAreInPositionOrder() {
		UUID first = UUID.fromString("0199b000-0000-7000-8000-0000000000b1");
		UUID second = UUID.fromString("0199b000-0000-7000-8000-0000000000b2");
		when(postMapper.findImages(List.of(POST_ID))).thenReturn(List.of(
				new PostImage(first, POST_ID, "posts/a.jpg", 0),
				new PostImage(second, POST_ID, "posts/b.png", 1)));

		PostResponse response = assembler.toResponse(row(CREATED));

		assertThat(response.images()).containsExactly(
				new PostImageResponse(first, "https://images.test/posts/a.jpg"),
				new PostImageResponse(second, "https://images.test/posts/b.png"));
	}

	@Test
	@DisplayName("保存先が URL を作れない（urlOf が null）画像は、応答から省く")
	void imagesWithoutUrlAreOmitted() {
		ImageStorage disabled = mock(ImageStorage.class);
		when(disabled.urlOf("posts/a.jpg")).thenReturn(null);
		when(disabled.urlOf("posts/b.jpg")).thenReturn("https://images.test/posts/b.jpg");
		PostAssembler assemblerWithoutUrl = new PostAssembler(postMapper, disabled);
		UUID kept = UUID.fromString("0199b000-0000-7000-8000-0000000000b2");
		when(postMapper.findImages(List.of(POST_ID))).thenReturn(List.of(
				image("0199b000-0000-7000-8000-0000000000b1", POST_ID, "posts/a.jpg", 0),
				new PostImage(kept, POST_ID, "posts/b.jpg", 1)));

		PostResponse response = assemblerWithoutUrl.toResponse(row(CREATED));

		assertThat(response.images()).containsExactly(new PostImageResponse(kept, "https://images.test/posts/b.jpg"));
	}

	@Test
	@DisplayName("toResponses は並びを保って 1 件ずつ組み立て、画像は投稿ごとに振り分ける")
	void toResponsesKeepsOrderAndGroupsImages() {
		PostWithAuthor first = row(CREATED);
		UUID secondId = UUID.fromString("0199b000-0000-7000-8000-0000000000a2");
		PostWithAuthor second = new PostWithAuthor(secondId, USER_ID, "二つ目", CREATED, CREATED, "taro_1", "太郎",
				null);
		when(postMapper.findImages(List.of(POST_ID, secondId))).thenReturn(List.of(
				image("0199b000-0000-7000-8000-0000000000b1", POST_ID, "posts/a.jpg", 0),
				image("0199b000-0000-7000-8000-0000000000b2", secondId, "posts/b.jpg", 0),
				image("0199b000-0000-7000-8000-0000000000b3", secondId, "posts/c.jpg", 1)));

		List<PostResponse> responses = assembler.toResponses(List.of(first, second));

		assertThat(responses).extracting(PostResponse::body).containsExactly("本文", "二つ目");
		assertThat(responses.get(0).images()).extracting(PostImageResponse::url)
				.containsExactly("https://images.test/posts/a.jpg");
		assertThat(responses.get(1).images()).extracting(PostImageResponse::url)
				.containsExactly("https://images.test/posts/b.jpg", "https://images.test/posts/c.jpg");
	}

	@Test
	@DisplayName("行が空なら、画像を問い合わせずに空のリストを返す")
	void emptyRowsDoNotQuery() {
		assertThat(assembler.toResponses(List.of())).isEmpty();

		verifyNoInteractions(postMapper);
	}

	@Test
	@DisplayName("20 件の一覧でも findImages は 1 回だけ呼ばれる")
	void twentyRowsQueryImagesOnce() {
		List<PostWithAuthor> rows = new ArrayList<>();
		for (int i = 0; i < 20; i++) {
			UUID id = UUID.fromString(String.format("0199b000-0000-7000-8000-%012x", 0x1000 - i));
			rows.add(new PostWithAuthor(id, USER_ID, "本文" + i, CREATED, CREATED, "taro_1", "太郎", null));
		}
		when(postMapper.findImages(anyList())).thenReturn(List.of());

		assertThat(assembler.toResponses(rows)).hasSize(20);

		verify(postMapper, times(1)).findImages(rows.stream().map(PostWithAuthor::id).toList());
		verify(postMapper, never()).findImageKeys(any());
	}

}

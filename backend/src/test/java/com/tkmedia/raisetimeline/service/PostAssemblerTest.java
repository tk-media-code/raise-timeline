package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PostAssemblerTest {

	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final OffsetDateTime CREATED = OffsetDateTime.parse("2026-10-09T00:00:00Z");

	private final PostAssembler assembler = new PostAssembler();

	private static PostWithAuthor row(OffsetDateTime updatedAt) {
		return new PostWithAuthor(POST_ID, USER_ID, "本文", CREATED, updatedAt, "taro_1", "太郎", "avatars/x.png");
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
	@DisplayName("author は UserSummary(userId, username, displayName, null)。アイコンの URL はまだ無い")
	void authorIsUserSummary() {
		PostResponse response = assembler.toResponse(row(CREATED));

		assertThat(response.author()).isEqualTo(new UserSummary(USER_ID, "taro_1", "太郎", null));
		assertThat(response.id()).isEqualTo(POST_ID);
		assertThat(response.body()).isEqualTo("本文");
		assertThat(response.createdAt()).isEqualTo(CREATED);
	}

	@Test
	@DisplayName("画像・いいね・コメントは暫定値: images は空、数は 0、likedByMe は false")
	void interimValues() {
		PostResponse response = assembler.toResponse(row(CREATED));

		assertThat(response.images()).isEmpty();
		assertThat(response.likeCount()).isZero();
		assertThat(response.commentCount()).isZero();
		assertThat(response.likedByMe()).isFalse();
	}

	@Test
	@DisplayName("toResponses は並びを保って 1 件ずつ組み立てる")
	void toResponsesKeepsOrder() {
		PostWithAuthor first = row(CREATED);
		PostWithAuthor second = new PostWithAuthor(UUID.fromString("0199b000-0000-7000-8000-0000000000a2"), USER_ID,
				"二つ目", CREATED, CREATED, "taro_1", "太郎", null);

		List<PostResponse> responses = assembler.toResponses(List.of(first, second));

		assertThat(responses).extracting(PostResponse::body).containsExactly("本文", "二つ目");
		assertThat(assembler.toResponses(List.of())).isEmpty();
	}

}

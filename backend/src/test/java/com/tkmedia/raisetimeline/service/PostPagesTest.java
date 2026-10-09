package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PostPagesTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 9, 1, 2, 3, 0, ZoneOffset.UTC);
	private static final UUID AUTHOR = UUID.fromString("0199b000-0000-7000-8000-0000000000ff");

	/** id の降順に並んだ n 行。 */
	private static List<PostWithAuthor> rows(int n) {
		List<PostWithAuthor> rows = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			UUID id = UUID.fromString(String.format("0199b000-0000-7000-8000-%012x", 0x1000 - i));
			rows.add(new PostWithAuthor(id, AUTHOR, "本文" + i, NOW, NOW, "taro_1", "太郎", null));
		}
		return rows;
	}

	@Test
	@DisplayName("limit 以下の行数なら、全部を返し、nextCursor は null")
	void pageWithoutExtraRow() {
		PageResponse<PostResponse> page = PostPages.of(rows(20), 20, new PostAssembler());

		assertThat(page.items()).hasSize(20);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("limit より 1 行多ければ、先頭 limit 件を返し、nextCursor は limit 件目の id")
	void pageWithExtraRow() {
		List<PostWithAuthor> rows = rows(21);

		PageResponse<PostResponse> page = PostPages.of(rows, 20, new PostAssembler());

		assertThat(page.items()).hasSize(20);
		assertThat(page.items().get(19).id()).isEqualTo(rows.get(19).id());
		assertThat(page.nextCursor()).isEqualTo(rows.get(19).id());
	}

}

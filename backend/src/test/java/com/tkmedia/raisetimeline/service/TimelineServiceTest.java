package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TimelineServiceTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 9, 1, 2, 3, 0, ZoneOffset.UTC);
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000ff");

	private final PostMapper postMapper = mock(PostMapper.class);
	private final TimelineService service = new TimelineService(postMapper, new PostAssembler(postMapper, new InMemoryImageStorage()));

	/** id の降順に並んだ n 行。 */
	private static List<PostWithAuthor> rows(int n) {
		List<PostWithAuthor> rows = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			UUID id = UUID.fromString(String.format("0199b000-0000-7000-8000-%012x", 0x1000 - i));
			rows.add(new PostWithAuthor(id, CURSOR, "本文" + i, NOW, NOW, "taro_1", "太郎", null));
		}
		return rows;
	}

	@Test
	@DisplayName("次のページがあるか知るために、limit より 1 行多く取る")
	void fetchesOneMoreThanLimit() {
		when(postMapper.findAll(CURSOR, 21)).thenReturn(List.of());

		service.all(CURSOR, 20);

		verify(postMapper).findAll(CURSOR, 21);
	}

	@Test
	@DisplayName("0 行なら、items は空で nextCursor は null")
	void emptyHasNoNextCursor() {
		when(postMapper.findAll(null, 21)).thenReturn(List.of());

		PageResponse<PostResponse> page = service.all(null, 20);

		assertThat(page.items()).isEmpty();
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("limit と同じ行数なら、nextCursor は null")
	void exactlyLimitHasNoNextCursor() {
		when(postMapper.findAll(null, 21)).thenReturn(rows(20));

		PageResponse<PostResponse> page = service.all(null, 20);

		assertThat(page.items()).hasSize(20);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("limit + 1 行なら、items は limit 件で、nextCursor は limit 件目の id")
	void oneMoreRowGivesNextCursor() {
		List<PostWithAuthor> rows = rows(21);
		when(postMapper.findAll(null, 21)).thenReturn(rows);

		PageResponse<PostResponse> page = service.all(null, 20);

		assertThat(page.items()).hasSize(20);
		assertThat(page.items().get(19).id()).isEqualTo(rows.get(19).id());
		assertThat(page.nextCursor()).isEqualTo(rows.get(19).id());
	}

}

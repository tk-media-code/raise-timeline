package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.tkmedia.raisetimeline.dto.PageResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PagesTest {

	/** 一覧の行の代わり。カーソルにする id と、画面に出す名前だけを持つ。 */
	private record Row(UUID id, String name) {
	}

	/** id の降順に並んだ n 行。 */
	private static List<Row> rows(int n) {
		List<Row> rows = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			UUID id = UUID.fromString(String.format("0199b000-0000-7000-8000-%012x", 0x1000 - i));
			rows.add(new Row(id, "行" + i));
		}
		return rows;
	}

	/** toItems に渡された行を記録して、名前の一覧にする。 */
	private static final class RecordingToItems implements Function<List<Row>, List<String>> {

		private List<Row> received;

		@Override
		public List<String> apply(List<Row> page) {
			this.received = List.copyOf(page);
			return page.stream().map(Row::name).toList();
		}

	}

	@Test
	@DisplayName("0 行なら、空を toItems に渡し、nextCursor は null")
	void emptyRows() {
		RecordingToItems toItems = new RecordingToItems();

		PageResponse<String> page = Pages.of(rows(0), 20, Row::id, toItems);

		assertThat(toItems.received).isEmpty();
		assertThat(page.items()).isEmpty();
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("ちょうど limit 行なら、全部を toItems に渡し、nextCursor は null")
	void exactlyLimitRows() {
		List<Row> rows = rows(20);
		RecordingToItems toItems = new RecordingToItems();

		PageResponse<String> page = Pages.of(rows, 20, Row::id, toItems);

		assertThat(toItems.received).containsExactlyElementsOf(rows);
		assertThat(page.items()).hasSize(20);
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("limit を超えたら、先頭 limit 行だけを toItems に渡し、nextCursor は limit 行目の cursorOf")
	void moreThanLimitRows() {
		List<Row> rows = rows(3);
		RecordingToItems toItems = new RecordingToItems();

		PageResponse<String> page = Pages.of(rows, 2, Row::id, toItems);

		assertThat(toItems.received).containsExactly(rows.get(0), rows.get(1));
		assertThat(page.nextCursor()).isEqualTo(rows.get(1).id());
	}

	@Test
	@DisplayName("toItems の結果が、そのまま items になる")
	void itemsAreWhatToItemsReturns() {
		PageResponse<Integer> page = Pages.of(rows(3), 2, Row::id, p -> List.of(7, 8, 9));

		assertThat(page.items()).containsExactly(7, 8, 9);
	}

}

package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * タイムライン。いまは「すべて」（全員の投稿を新しい順）だけ。
 *
 * <p>ページ送りはカーソル方式で、カーソルは直前のページの最後の投稿の id。id は時刻順に並ぶ（UUIDv7）ので、
 * 「それより小さい id」が「それより古い投稿」になる。ページを読んでいる間に新しい投稿が増えても、
 * 投稿が消えても、続きがずれたり重複したりしない（件数で数える OFFSET 方式との違い）。
 */
@Service
public class TimelineService {

	private final PostMapper postMapper;
	private final PostAssembler assembler;

	public TimelineService(PostMapper postMapper, PostAssembler assembler) {
		this.postMapper = postMapper;
		this.assembler = assembler;
	}

	/** ページの打ち切り方（{@code limit} より 1 行多く読む理由）は {@link PostPages}。 */
	public PageResponse<PostResponse> all(UUID cursor, int limit) {
		return PostPages.of(postMapper.findAll(cursor, limit + 1), limit, assembler);
	}

}

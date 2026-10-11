package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * ユーザー名か表示名の一部（大文字小文字を区別しない）でユーザーを探す。
 *
 * <p>{@code @Transactional} は付けない。読む SQL が 1 文だけで、まとめて守る相手が無い。
 *
 * <p>検索語の検証を Bean Validation の注釈にしないのは、{@link SearchQueries} の説明のとおり（{@code @NotBlank} は
 * {@code trim()} で判定するので、全角空白だけの語が通る。{@link CommentBodyRules} と同じ理由）。
 */
@Service
public class UserSearchService {

	private final UserMapper userMapper;
	private final ImageStorage imageStorage;

	public UserSearchService(UserMapper userMapper, ImageStorage imageStorage) {
		this.userMapper = userMapper;
		this.imageStorage = imageStorage;
	}

	/**
	 * {@code rawQuery} を検証して（誤りは 422）、部分一致する人を {@code users.id} の新しい方から返す。各行の
	 * {@code isFollowing} は {@code viewer} がフォローしているか。{@code limit} より 1 行多く読み、あふれた分は返さずに
	 * {@code nextCursor}（返す最後の人の {@code id}）で続きがあることだけを知らせる。打ち切り方は {@link Pages}。
	 */
	public PageResponse<UserCard> search(UUID viewer, String rawQuery, UUID cursor, int limit) {
		String pattern = SearchQueries.containsPattern(SearchQueries.validate(rawQuery));
		return Pages.of(userMapper.search(pattern, viewer, cursor, limit + 1), limit, UserCardRow::cursorId,
				page -> page.stream().map(row -> UserCards.of(row, imageStorage)).toList());
	}

}

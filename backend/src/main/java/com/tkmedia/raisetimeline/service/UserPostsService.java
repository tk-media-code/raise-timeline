package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** プロフィール画面の、その人の投稿一覧。並びとカーソルはタイムラインと同じ（{@link PostPages}）。 */
@Service
public class UserPostsService {

	private final UserService userService;
	private final PostMapper postMapper;
	private final PostAssembler assembler;

	public UserPostsService(UserService userService, PostMapper postMapper, PostAssembler assembler) {
		this.userService = userService;
		this.postMapper = postMapper;
		this.assembler = assembler;
	}

	/** 利用者がいなければ（規則に合わない名前も）{@link com.tkmedia.raisetimeline.error.NotFoundException}。 */
	public PageResponse<PostResponse> postsOf(UUID viewer, String username, UUID cursor, int limit) {
		UUID userId = userService.requireByUsername(username).id();
		return PostPages.of(postMapper.findByUser(userId, cursor, limit + 1), limit, assembler, viewer);
	}

}

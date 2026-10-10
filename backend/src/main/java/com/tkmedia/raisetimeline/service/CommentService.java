package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.CommentWithAuthor;
import com.tkmedia.raisetimeline.dto.CommentResponse;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.mapper.CommentMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * コメントを書く・読む・消す。
 *
 * <p>{@code @Transactional} は付けない。どの処理も 1 文か、読むだけで済む。
 *
 * <p>書くときは投稿の存在を先に確かめない。本文を検査してから入れ、外部キー違反で「投稿が無い」を見分ける。
 * 先に読むと、読んでから入れるまでの間に投稿が消された場合を別に扱う必要が出るので、経路を 1 つにする
 * （{@link LikeService} と同じ）。そのため、本文が不正で投稿も無いときは 422 になる。
 * 一覧は、投稿が無いのか 0 件なのかを区別したいので、先に {@link PostMapper#existsById} で確かめる。
 * 消すときは主キーで引き、無ければ 404、他人のなら 403。投稿の持ち主でも他人のコメントは消せない。
 */
@Service
public class CommentService {

	private static final Logger log = LoggerFactory.getLogger(CommentService.class);

	/** 外部キーの名前（V4__comments.sql の既定名）。違反したとき、どの参照が切れたかをこれで見分ける。 */
	private static final String POST_FOREIGN_KEY = "comments_post_id_fkey";
	private static final String USER_FOREIGN_KEY = "comments_user_id_fkey";

	private final CommentMapper commentMapper;
	private final PostMapper postMapper;
	private final ImageStorage imageStorage;
	private final Clock clock;

	public CommentService(CommentMapper commentMapper, PostMapper postMapper, ImageStorage imageStorage,
			Clock clock) {
		this.commentMapper = commentMapper;
		this.postMapper = postMapper;
		this.imageStorage = imageStorage;
		this.clock = clock;
	}

	/** 投稿が無ければ 404、書いた人（トークンの利用者）が居なければ 401、本文が不正なら 422。 */
	public CommentResponse create(UUID me, UUID postId, String rawBody) {
		String body = CommentBodyRules.validate(rawBody);
		UUID id;
		try {
			id = commentMapper.insert(postId, me, body, OffsetDateTime.now(clock));
		}
		catch (DataIntegrityViolationException e) {
			throw translate(e);
		}
		return toResponse(commentMapper.findById(id).orElseThrow(NotFoundException::new));
	}

	/**
	 * コメントを、書いた順の新しい方から返す。{@code limit} より 1 行多く読み、あふれた分は返さずに
	 * {@code nextCursor}（返す最後の行の {@code comments.id}）で続きがあることだけを知らせる。
	 * 打ち切りの形は {@link LikeService#likers} と同じ（共通化は別の Issue で行う）。
	 */
	public PageResponse<CommentResponse> list(UUID postId, UUID cursor, int limit) {
		if (!postMapper.existsById(postId)) {
			throw new NotFoundException();
		}
		List<CommentWithAuthor> rows = commentMapper.findByPost(postId, cursor, limit + 1);
		boolean hasMore = rows.size() > limit;
		List<CommentWithAuthor> page = hasMore ? rows.subList(0, limit) : rows;
		UUID nextCursor = hasMore ? page.get(limit - 1).id() : null;
		return new PageResponse<>(page.stream().map(this::toResponse).toList(), nextCursor);
	}

	/** 無ければ 404、他人のコメントなら 403。 */
	public void delete(UUID me, UUID commentId) {
		CommentWithAuthor comment = commentMapper.findById(commentId).orElseThrow(NotFoundException::new);
		if (!comment.userId().equals(me)) {
			throw new ForbiddenException();
		}
		if (commentMapper.delete(commentId) == 0) {
			throw new NotFoundException();
		}
		log.atInfo()
				.addKeyValue(LogFields.EVENT_ACTION, LogEvents.COMMENT_DELETED)
				.addKeyValue(LogFields.APP_COMMENT_ID, commentId.toString())
				.log("コメントを削除した");
	}

	private CommentResponse toResponse(CommentWithAuthor row) {
		String avatarUrl = row.avatarKey() == null ? null : imageStorage.urlOf(row.avatarKey());
		return new CommentResponse(row.id(),
				new UserSummary(row.userId(), row.username(), row.displayName(), avatarUrl),
				row.body(), row.createdAt());
	}

	/**
	 * 投稿の外部キー違反は書く直前に投稿が消されたということなので 404、利用者の外部キー違反はトークンの利用者が
	 * もう居ない（退会と同時に書いた）ということなので 401 にする。
	 * 知らない制約は変換せず、そのまま投げて 500 にする（ERROR のログで気づけるように）。
	 */
	private static RuntimeException translate(DataIntegrityViolationException e) {
		if (ConstraintViolations.violates(e, POST_FOREIGN_KEY)) {
			return new NotFoundException();
		}
		if (ConstraintViolations.violates(e, USER_FOREIGN_KEY)) {
			return new UnauthenticatedException();
		}
		return e;
	}

}

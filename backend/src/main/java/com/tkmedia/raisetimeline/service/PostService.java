package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * 投稿の作成・取得・編集・削除。
 *
 * <p>どのメソッドにも {@code @Transactional} を付けない。どれも 1 回の書き込みと読みだけで、まとめる必要がない。
 * 本文はログに書かない。
 */
@Service
public class PostService {

	private static final Logger log = LoggerFactory.getLogger(PostService.class);

	/** 外部キーの名前（db/ の定義と合わせる）。違反したとき、どの参照が切れたかをこれで見分ける。 */
	private static final String USER_FOREIGN_KEY = "posts_user_id_fkey";

	private final PostMapper postMapper;
	private final PostAssembler assembler;
	private final Clock clock;

	public PostService(PostMapper postMapper, PostAssembler assembler, Clock clock) {
		this.postMapper = postMapper;
		this.assembler = assembler;
		this.clock = clock;
	}

	public PostResponse create(UUID me, String rawBody) {
		// 画像は Issue 5 まで受け取らないので、画像は無いものとして検査する（コントローラが先に 503 にしている）。
		String body = PostBodyRules.validate(rawBody, false);
		OffsetDateTime now = OffsetDateTime.now(clock);
		UUID id;
		try {
			id = postMapper.insert(new Post(null, me, body, now, now));
		}
		catch (DataIntegrityViolationException e) {
			throw translate(e);
		}
		return assembler.toResponse(postMapper.findById(id).orElseThrow(NotFoundException::new));
	}

	public PostResponse get(UUID id) {
		return assembler.toResponse(postMapper.findById(id).orElseThrow(NotFoundException::new));
	}

	/** 判定の順序は 404、403、422。他人の投稿には、本文が不正でも 403 を返す。 */
	public PostResponse updateBody(UUID me, UUID id, String rawBody) {
		PostWithAuthor post = ownedBy(me, id);
		// Issue 5 で、その投稿の画像の有無を渡す。画像があれば、本文は空にできる。
		String body = PostBodyRules.validate(rawBody, false);
		if (postMapper.updateBody(post.id(), body, OffsetDateTime.now(clock)) == 0) {
			throw new NotFoundException();
		}
		return assembler.toResponse(postMapper.findById(id).orElseThrow(NotFoundException::new));
	}

	public void delete(UUID me, UUID id) {
		ownedBy(me, id);
		if (postMapper.delete(id) == 0) {
			throw new NotFoundException();
		}
		log.atInfo()
				.addKeyValue(LogFields.EVENT_ACTION, LogEvents.POST_DELETED)
				.addKeyValue(LogFields.APP_POST_ID, id.toString())
				.log("投稿を削除した");
	}

	/** 投稿を読み、本人のものでなければ例外にする。無ければ 404、他人のなら 403。 */
	private PostWithAuthor ownedBy(UUID me, UUID id) {
		PostWithAuthor post = postMapper.findById(id).orElseThrow(NotFoundException::new);
		if (!post.userId().equals(me)) {
			throw new ForbiddenException();
		}
		return post;
	}

	/**
	 * 投稿者の外部キー違反は、トークンの利用者がもう居ない（有効期間中に消えた）ということなので、401 にする。
	 * 知らない制約は変換せず、そのまま投げて 500 にする（ERROR のログで気づけるように）。
	 */
	private static RuntimeException translate(DataIntegrityViolationException e) {
		String message = e.getMostSpecificCause().getMessage();
		if (message != null && message.contains(USER_FOREIGN_KEY)) {
			return new UnauthenticatedException();
		}
		return e;
	}

}

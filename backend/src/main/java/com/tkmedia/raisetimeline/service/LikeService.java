package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.Liker;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.mapper.LikeMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * いいねの付け外しと、いいねした人の一覧。
 *
 * <p>{@code @Transactional} は付けない。どの処理も 1 文か、読むだけで済む。
 *
 * <p>付けるときだけ、投稿の存在を先に確かめない。{@code INSERT ... ON CONFLICT DO NOTHING} は、すでに付けていても
 * 例外にならず 0 行になるだけなので、投稿が無いときの外部キー違反だけが「投稿が無い」の合図になる。
 * 先に読むと、読んでから入れるまでの間に投稿が消された場合を別に扱う必要が出る。
 * 外すときと一覧は逆で、付けていなくても 204 なので、消した行数では投稿の有無が分からない。
 * 一覧も、投稿が無いのか 0 件なのかを区別したい。そのため先に {@link PostMapper#existsById} で確かめる。
 */
@Service
public class LikeService {

	/** 外部キーの名前（V3__likes.sql と合わせる）。違反したとき、どの参照が切れたかをこれで見分ける。 */
	private static final String POST_FOREIGN_KEY = "likes_post_id_fkey";
	private static final String USER_FOREIGN_KEY = "likes_user_id_fkey";

	private final LikeMapper likeMapper;
	private final PostMapper postMapper;
	private final ImageStorage imageStorage;

	public LikeService(LikeMapper likeMapper, PostMapper postMapper, ImageStorage imageStorage) {
		this.likeMapper = likeMapper;
		this.postMapper = postMapper;
		this.imageStorage = imageStorage;
	}

	/** すでに付けていても成功として返す。投稿が無ければ 404、付けた人（トークンの利用者）が居なければ 401。 */
	public void like(UUID me, UUID postId) {
		try {
			likeMapper.insert(postId, me);
		}
		catch (DataIntegrityViolationException e) {
			throw translate(e);
		}
	}

	/** 付けていなくても成功として返す。投稿が無ければ 404。 */
	public void unlike(UUID me, UUID postId) {
		requirePost(postId);
		likeMapper.delete(postId, me);
	}

	/**
	 * いいねした人を、付けた順の新しい方から返す。{@code limit} より 1 行多く読み、あふれた分は返さずに
	 * {@code nextCursor}（返す最後の行の {@code likes.id}）で続きがあることだけを知らせる。
	 * 打ち切りの形は {@link PostPages} と同じ（項目の型とカーソルの列が違うので、ここに書いている）。
	 */
	public PageResponse<UserCard> likers(UUID postId, UUID cursor, int limit) {
		requirePost(postId);
		List<Liker> rows = likeMapper.findLikers(postId, cursor, limit + 1);
		boolean hasMore = rows.size() > limit;
		List<Liker> page = hasMore ? rows.subList(0, limit) : rows;
		UUID nextCursor = hasMore ? page.get(limit - 1).likeId() : null;
		return new PageResponse<>(page.stream().map(this::toCard).toList(), nextCursor);
	}

	private void requirePost(UUID postId) {
		if (!postMapper.existsById(postId)) {
			throw new NotFoundException();
		}
	}

	private UserCard toCard(Liker liker) {
		String avatarUrl = liker.avatarKey() == null ? null : imageStorage.urlOf(liker.avatarKey());
		// isFollowing はフォローの機能ができるまで false 固定。
		return new UserCard(liker.userId(), liker.username(), liker.displayName(), avatarUrl, liker.bio(), false);
	}

	/**
	 * 投稿の外部キー違反は付ける直前に投稿が消されたということなので 404、利用者の外部キー違反はトークンの利用者が
	 * もう居ない（退会と同時に付けた）ということなので 401 にする。
	 * 知らない制約は変換せず、そのまま投げて 500 にする（ERROR のログで気づけるように）。
	 */
	private static RuntimeException translate(DataIntegrityViolationException e) {
		String message = e.getMostSpecificCause().getMessage();
		if (message != null && message.contains(POST_FOREIGN_KEY)) {
			return new NotFoundException();
		}
		if (message != null && message.contains(USER_FOREIGN_KEY)) {
			return new UnauthenticatedException();
		}
		return e;
	}

}

package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.domain.UserCardRow;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.mapper.FollowMapper;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * フォローと解除、フォロワーとフォロー中の一覧。相手はすべてユーザー名（大文字小文字を区別しない）で指す。
 *
 * <p>{@code @Transactional} は付けない。どの処理も、相手を引いたあとの 1 文か、読むだけで済む。
 *
 * <p>どの処理も、まず {@link UserService#requireByUsername} で相手を引く（居なければ・規則に合わなければ 404）。
 * 相手を引いてから入れるまでの間に相手が退会した場合は、{@code follows_followee_id_fkey} の外部キー違反になる。
 * これも 404 に変換するので、先に引いても引かなくても、相手が居ないときの応答は 404 でそろう。
 */
@Service
public class FollowService {

	/** 自分自身をフォローしようとしたときの 422 の文言。 */
	static final String CANNOT_FOLLOW_SELF = "自分自身はフォローできません";

	/** 外部キーの名前（V5__follows.sql と合わせる）。違反したとき、どの参照が切れたかをこれで見分ける。 */
	private static final String FOLLOWEE_FOREIGN_KEY = "follows_followee_id_fkey";
	private static final String FOLLOWER_FOREIGN_KEY = "follows_follower_id_fkey";

	private final FollowMapper followMapper;
	private final UserService userService;
	private final ImageStorage imageStorage;

	public FollowService(FollowMapper followMapper, UserService userService, ImageStorage imageStorage) {
		this.followMapper = followMapper;
		this.userService = userService;
		this.imageStorage = imageStorage;
	}

	/**
	 * すでにフォローしていても成功として返す。相手が居なければ 404、自分自身なら 422（行は入れない）、
	 * フォローする人（トークンの利用者）が居なければ 401。
	 */
	public void follow(UUID me, String username) {
		User target = userService.requireByUsername(username);
		if (target.id().equals(me)) {
			throw new ValidationException(List.of(new FieldError("username", CANNOT_FOLLOW_SELF)));
		}
		try {
			followMapper.insert(me, target.id());
		}
		catch (DataIntegrityViolationException e) {
			throw translate(e);
		}
	}

	/** フォローしていなくても、自分を指していても成功として返す。相手が居なければ 404。 */
	public void unfollow(UUID me, String username) {
		followMapper.delete(me, userService.requireByUsername(username).id());
	}

	/**
	 * {@code username} のフォロワーを、フォローされた順の新しい方から返す。各行の {@code isFollowing} は
	 * {@code viewer} がフォローしているか。{@code limit} より 1 行多く読み、あふれた分は返さずに
	 * {@code nextCursor}（返す最後の行の {@code follows.id}）で続きがあることだけを知らせる。打ち切り方は {@link Pages}。
	 */
	public PageResponse<UserCard> followers(UUID viewer, String username, UUID cursor, int limit) {
		UUID userId = userService.requireByUsername(username).id();
		return page(followMapper.findFollowers(userId, viewer, cursor, limit + 1), limit);
	}

	/** {@code username} がフォローしている人を返す。並び・カーソルの扱いは {@link #followers} と同じ。 */
	public PageResponse<UserCard> following(UUID viewer, String username, UUID cursor, int limit) {
		UUID userId = userService.requireByUsername(username).id();
		return page(followMapper.findFollowing(userId, viewer, cursor, limit + 1), limit);
	}

	private PageResponse<UserCard> page(List<UserCardRow> rows, int limit) {
		return Pages.of(rows, limit, UserCardRow::cursorId,
				page -> page.stream().map(row -> UserCards.of(row, imageStorage)).toList());
	}

	/**
	 * 相手の外部キー違反は引いた直後に相手が退会したということなので 404、フォローする人の外部キー違反は
	 * トークンの利用者がもう居ない（退会と同時にフォローした）ということなので 401 にする。
	 * 知らない制約は変換せず、そのまま投げて 500 にする（ERROR のログで気づけるように）。
	 */
	private static RuntimeException translate(DataIntegrityViolationException e) {
		if (ConstraintViolations.violates(e, FOLLOWEE_FOREIGN_KEY)) {
			return new NotFoundException();
		}
		if (ConstraintViolations.violates(e, FOLLOWER_FOREIGN_KEY)) {
			return new UnauthenticatedException();
		}
		return e;
	}

}

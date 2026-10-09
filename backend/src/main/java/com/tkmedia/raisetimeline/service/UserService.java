package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.dto.UserDetail;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.validation.Usernames;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class UserService {

	private final UserMapper userMapper;

	public UserService(UserMapper userMapper) {
		this.userMapper = userMapper;
	}

	/** ログイン中の本人の情報。利用者がいなければ {@link NotFoundException}。 */
	public Me getMe(UUID userId) {
		return userMapper.findById(userId).map(this::toMe).orElseThrow(NotFoundException::new);
	}

	/**
	 * 利用者を本人向けの {@link Me} にする。
	 *
	 * <p>フォロー数・フォロー状態・アイコンの URL は、それぞれを作る後の Issue まで暫定値を入れる
	 * （数は 0、{@code isFollowing} は false、{@code avatarUrl} は null）。
	 */
	public Me toMe(User user) {
		return new Me(user.id(), user.username(), user.displayName(), null, user.bio(), false, 0, 0,
				user.createdAt(), true, user.email());
	}

	/**
	 * URL のユーザー名から利用者を引く（大文字小文字は区別しない）。いなければ {@link NotFoundException}。
	 *
	 * <p>規則に合わない名前は DB に問い合わせず、いないものとして扱う。NUL を含む値を PostgreSQL に渡すと 500 になり、
	 * 規則に合わない名前の人は登録できないので存在しない。
	 */
	public User requireByUsername(String username) {
		if (!Usernames.isWellFormed(username)) {
			throw new NotFoundException();
		}
		return userMapper.findByUsername(username).orElseThrow(NotFoundException::new);
	}

	/** {@code me} は見ている人の id。{@code isMe}（本人か）を決めるのに使う。 */
	public UserDetail getProfile(String username, UUID me) {
		return toDetail(requireByUsername(username), me);
	}

	/**
	 * 利用者を他人にも見せる {@link UserDetail} にする。{@code email} は入れない。
	 *
	 * <p>フォロー数・フォロー状態・アイコンの URL は、それぞれを作る後の Issue まで暫定値を入れる
	 * （数は 0、{@code isFollowing} は false、{@code avatarUrl} は null）。
	 */
	public UserDetail toDetail(User user, UUID me) {
		return new UserDetail(user.id(), user.username(), user.displayName(), null, user.bio(), false, 0, 0,
				user.createdAt(), user.id().equals(me));
	}

}

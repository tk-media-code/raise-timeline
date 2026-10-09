package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.mapper.UserMapper;
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

}

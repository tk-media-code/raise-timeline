package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.dto.UpdateProfileRequest;
import com.tkmedia.raisetimeline.dto.UserDetail;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.validation.Usernames;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class UserService {

	private final UserMapper userMapper;
	private final ImageStorage imageStorage;
	private final Clock clock;

	public UserService(UserMapper userMapper, ImageStorage imageStorage, Clock clock) {
		this.userMapper = userMapper;
		this.imageStorage = imageStorage;
		this.clock = clock;
	}

	/**
	 * ログイン中の本人の情報。利用者がいなければ {@link UnauthenticatedException}（401）。
	 *
	 * <p>認証を通ったあとに本人の行が消えたとき（退会と同時の操作）に当たる。「本人の行がもう無ければ 401」という
	 * ほかの API の決まりにそろえ、404 にはしない。
	 */
	public Me getMe(UUID userId) {
		return userMapper.findById(userId).map(this::toMe).orElseThrow(UnauthenticatedException::new);
	}

	/**
	 * 本人の表示名と自己紹介を更新し、更新後の {@link Me} を返す。{@code updated_at} は {@link Clock} の時刻を渡す。
	 *
	 * <p>更新と読み取りは {@code UPDATE ... RETURNING} の 1 文で済ませる。行が無い（認証を通ったあとに退会された）ときは
	 * 空が返るので、投稿の作成（外部キー違反）と同じく 401 にする。
	 */
	public Me updateProfile(UUID me, UpdateProfileRequest request) {
		return userMapper.updateProfile(me, request.displayName(), request.bio(), OffsetDateTime.now(clock))
				.map(this::toMe)
				.orElseThrow(UnauthenticatedException::new);
	}

	/**
	 * 利用者を本人向けの {@link Me} にする。
	 *
	 * <p>フォロー数・フォロー状態は、それぞれを作る後の Issue まで暫定値を入れる
	 * （数は 0、{@code isFollowing} は false）。{@code avatarUrl} は保存先のキーから作る。
	 */
	public Me toMe(User user) {
		return new Me(user.id(), user.username(), user.displayName(), avatarUrlOf(user), user.bio(), false, 0, 0,
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
	 * <p>フォロー数・フォロー状態は、それぞれを作る後の Issue まで暫定値を入れる
	 * （数は 0、{@code isFollowing} は false）。{@code avatarUrl} は保存先のキーから作る。
	 */
	public UserDetail toDetail(User user, UUID me) {
		return new UserDetail(user.id(), user.username(), user.displayName(), avatarUrlOf(user), user.bio(), false, 0, 0,
				user.createdAt(), user.id().equals(me));
	}

	/** アイコンを設定していない人は avatarKey が null。そのときは URL も null にする。 */
	private String avatarUrlOf(User user) {
		return user.avatarKey() == null ? null : imageStorage.urlOf(user.avatarKey());
	}

}

package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.error.InvalidPasswordException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.ImageCleaner;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;

/**
 * 退会。利用者の行を消し、投稿・画像の行・リフレッシュトークンは外部キーの連鎖で一緒に消す。
 * その後で、保存先（S3）の画像を消す。
 *
 * <p>順序（docs/features/auth.md 4 章）: パスワードの照合 → トランザクションの中で「行を押さえる・キーを集める・消す」
 * → コミットの後に S3 の削除。{@code @Transactional} は付けない。BCrypt の照合は計算が遅いので、
 * トランザクションの外で先に済ませる（{@link AuthService} と同じ理由）。S3 の削除もコミットの後で、DB の接続を
 * 握ったまま外部の通信をしない。
 *
 * <p>行を {@code FOR UPDATE} で押さえるのは、同じ人の進行中の投稿やアイコンの更新を待つため。押さえないと、
 * キーを集めた後に入った画像が、行が消えたあとも S3 に残る。押さえたあとの挿入は、こちらのコミットまで待たされ、
 * 利用者がいない（外部キー違反）ので失敗する。
 *
 * <p>同じ人のトークンの更新と同時に走ると、まれに DB のデッドロックで片方が 500 になる。更新はトークンの行を消してから
 * {@code users} に依存する行を入れ、退会は {@code users} の行を押さえてからトークンの行を消すので、ロックの順が
 * 逆になるため。PostgreSQL が片方を取り消すのでデータは壊れず、やり直せば済むので、受け入れる。
 *
 * <p>ログには出来事 {@code user.withdrew} だけを残す。利用者 id は {@code MDC} にあり、パスワードやメールアドレスは
 * 書かない。パスワードが違うときは出来事を残さない。
 */
@Service
public class WithdrawalService {

	private static final Logger log = LoggerFactory.getLogger(WithdrawalService.class);

	private final UserMapper userMapper;
	private final PasswordEncoder passwordEncoder;
	private final ImageCleaner imageCleaner;
	private final TransactionOperations transactions;

	public WithdrawalService(UserMapper userMapper, PasswordEncoder passwordEncoder, ImageCleaner imageCleaner,
			TransactionOperations transactions) {
		this.userMapper = userMapper;
		this.passwordEncoder = passwordEncoder;
		this.imageCleaner = imageCleaner;
		this.transactions = transactions;
	}

	/**
	 * 本人の行がもう無いとき（2 つのタブでほぼ同時に退会した後のほう）は、
	 * 「本人の行がもう無ければ 401」というほかの API の決まりにそろえて {@link UnauthenticatedException}。
	 */
	public void withdraw(UUID me, String password) {
		User user = userMapper.findById(me).orElseThrow(UnauthenticatedException::new);
		if (!passwordEncoder.matches(password, user.passwordHash())) {
			throw new InvalidPasswordException();
		}
		List<String> keys = Objects.requireNonNull(transactions.execute(status -> {
			userMapper.lockById(me).orElseThrow(UnauthenticatedException::new);
			// 行を消すと画像の行も消えてキーが分からなくなるので、消す前に集める。
			List<String> collected = userMapper.findImageKeysOf(me);
			userMapper.deleteById(me);
			return collected;
		}));
		log.atInfo().addKeyValue(LogFields.EVENT_ACTION, LogEvents.USER_WITHDREW).log("退会した");
		// 保存先の削除は DB がコミットされてから。失敗しても退会は成功として返す（ImageCleaner が WARN を残す）。
		imageCleaner.deleteQuietly(keys);
	}

}

package com.tkmedia.raisetimeline.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.tkmedia.raisetimeline.domain.RefreshToken;
import com.tkmedia.raisetimeline.domain.User;

/**
 * lockByTokenHash が行を本当に押さえること（SQL の FOR UPDATE）を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>2 本の更新を同時に走らせるテストは、2 本が重なったときしか FOR UPDATE の有無を見分けられない。
 * ここでは片方のトランザクションが押さえたまま、もう片方が同じ行を押さえにいき、待たされることを毎回確かめる。
 *
 * <p>行を別のトランザクションから見せるために先にコミットする必要があるので、{@code @Transactional} は付けない。
 * 作った利用者は {@link #cleanUp()} で消す（リフレッシュトークンは外部キーの連鎖で消える）。
 */
@SpringBootTest
@ActiveProfiles("test")
class RefreshTokenLockTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 6, 12, 0, 0, 0, ZoneOffset.UTC);

	/** 待ちの時間切れ。デッドロックしてもビルドが止まらず、失敗になるようにする。 */
	private static final long TIMEOUT_SECONDS = 30;

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private RefreshTokenMapper refreshTokenMapper;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager transactionManager;

	private UUID userId;

	@AfterEach
	void cleanUp() {
		if (userId != null) {
			jdbc.update("DELETE FROM users WHERE id = ?", userId);
		}
	}

	@Test
	@DisplayName("lockByTokenHash は別のトランザクションが押さえている行を待ち、ロック待ちの例外になる")
	void lockByTokenHashWaitsForRowHeldByAnotherTransaction() throws Exception {
		TransactionTemplate tx = new TransactionTemplate(transactionManager);
		String s = UUID.randomUUID().toString().substring(0, 8);
		String tokenHash = "hash-" + UUID.randomUUID();
		userId = tx.execute(status -> {
			UUID id = userMapper.insert(new User(null, "user_" + s, "表示名", "user_" + s + "@example.com",
					"hash", "", null, NOW, NOW));
			refreshTokenMapper.insert(id, tokenHash, NOW.plusDays(30));
			return id;
		});

		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		CompletableFuture<Boolean> holder = CompletableFuture.supplyAsync(() -> tx.execute(status -> {
			RefreshToken row = refreshTokenMapper.lockByTokenHash(tokenHash, NOW);
			locked.countDown();
			try {
				release.await(TIMEOUT_SECONDS, TimeUnit.SECONDS);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return row != null;
		}));

		try {
			assertThat(locked.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();

			// 押さえている間に同じ行を押さえにいくと、待たされて時間切れ（200ms）になる。
			assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
				jdbc.execute("SET LOCAL lock_timeout = '200ms'");
				refreshTokenMapper.lockByTokenHash(tokenHash, NOW);
			})).isInstanceOf(PessimisticLockingFailureException.class);
		} finally {
			release.countDown();
		}

		assertThat(holder.get(TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();

		// 押さえていたトランザクションが終われば、同じ行をすぐ押さえられる。
		RefreshToken after = tx.execute(status -> refreshTokenMapper.lockByTokenHash(tokenHash, NOW));
		assertThat(after).isNotNull();
	}

}

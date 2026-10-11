package com.tkmedia.raisetimeline.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.tkmedia.raisetimeline.domain.RefreshToken;
import com.tkmedia.raisetimeline.domain.User;

/**
 * refresh_tokens テーブルと RefreshTokenMapper を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>本物の DB が要るので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RefreshTokenMapperTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 6, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private RefreshTokenMapper refreshTokenMapper;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	private UUID createUser() {
		String s = UUID.randomUUID().toString().substring(0, 8);
		return userMapper.insert(new User(null, "user_" + s, "表示名", "user_" + s + "@example.com",
				"hash", "", null, NOW, NOW));
	}

	private static String hash() {
		return "hash-" + UUID.randomUUID();
	}

	@Test
	@DisplayName("consume は持ち主の id を一度だけ返し、二度目は null を返す")
	void consumeReturnsUserIdOnce() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.plusDays(30));

		assertThat(refreshTokenMapper.consume(tokenHash, NOW)).isEqualTo(userId);
		assertThat(refreshTokenMapper.consume(tokenHash, NOW)).isNull();
	}

	@Test
	@DisplayName("期限が now より前のトークンは consume できず null を返す")
	void consumeRejectsExpired() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.minusSeconds(1));

		assertThat(refreshTokenMapper.consume(tokenHash, NOW)).isNull();
	}

	@Test
	@DisplayName("知らないトークンは consume できず null を返す")
	void consumeReturnsNullWhenUnknown() {
		assertThat(refreshTokenMapper.consume(hash(), NOW)).isNull();
	}

	@Test
	@DisplayName("deleteByTokenHash は期限に関わらず消して持ち主の id を返し、無ければ null を返す")
	void deleteByTokenHashReturnsUserId() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.minusDays(1));

		assertThat(refreshTokenMapper.deleteByTokenHash(tokenHash)).isEqualTo(userId);
		assertThat(refreshTokenMapper.deleteByTokenHash(tokenHash)).isNull();
	}

	@Test
	@DisplayName("deleteExpiredByUserId は、その人の期限切れの行だけを消す")
	void deleteExpiredByUserIdRemovesOnlyExpired() {
		UUID userId = createUser();
		UUID otherUserId = createUser();
		String expired = hash();
		String valid = hash();
		String othersExpired = hash();
		refreshTokenMapper.insert(userId, expired, NOW.minusDays(1));
		refreshTokenMapper.insert(userId, valid, NOW.plusDays(1));
		refreshTokenMapper.insert(otherUserId, othersExpired, NOW.minusDays(1));

		assertThat(refreshTokenMapper.deleteExpiredByUserId(userId, NOW)).isEqualTo(1);

		assertThat(count(expired)).isZero();
		assertThat(count(valid)).isEqualTo(1);
		assertThat(count(othersExpired)).isEqualTo(1);
	}

	@Test
	@DisplayName("users の行を消すと、その人の refresh_tokens の行も一緒に消える")
	void deletingUserCascades() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.plusDays(30));

		jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);

		assertThat(count(tokenHash)).isZero();
	}

	@Test
	@DisplayName("lockByTokenHash は期限内の行を返し、入れたばかりの行の usedAt は null")
	void lockByTokenHashReturnsLiveRow() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.plusDays(30));

		RefreshToken row = refreshTokenMapper.lockByTokenHash(tokenHash, NOW);

		assertThat(row).isNotNull();
		assertThat(row.id()).isNotNull();
		assertThat(row.userId()).isEqualTo(userId);
		assertThat(row.tokenHash()).isEqualTo(tokenHash);
		assertThat(row.expiresAt()).isEqualTo(NOW.plusDays(30));
		assertThat(row.usedAt()).isNull();
	}

	@Test
	@DisplayName("lockByTokenHash は、知らないトークンと期限切れのトークン（使用済みでも未使用でも）に null を返す")
	void lockByTokenHashReturnsNullWhenUnknownOrExpired() {
		UUID userId = createUser();
		String expiredUnused = hash();
		String expiredUsed = hash();
		String expiresExactlyNow = hash();
		refreshTokenMapper.insert(userId, expiredUnused, NOW.minusSeconds(1));
		refreshTokenMapper.insert(userId, expiredUsed, NOW.minusSeconds(1));
		jdbcTemplate.update("UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ?", NOW.minusDays(1), expiredUsed);
		refreshTokenMapper.insert(userId, expiresExactlyNow, NOW);

		assertThat(refreshTokenMapper.lockByTokenHash(hash(), NOW)).isNull();
		assertThat(refreshTokenMapper.lockByTokenHash(expiredUnused, NOW)).isNull();
		assertThat(refreshTokenMapper.lockByTokenHash(expiredUsed, NOW)).isNull();
		assertThat(refreshTokenMapper.lockByTokenHash(expiresExactlyNow, NOW)).isNull();
	}

	@Test
	@DisplayName("markUsed は used_at を書いて 1 を返し、2 回目は 0 を返して最初の時刻を書き換えない")
	void markUsedWritesOnce() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.plusDays(30));
		UUID id = refreshTokenMapper.lockByTokenHash(tokenHash, NOW).id();

		assertThat(refreshTokenMapper.markUsed(id, NOW)).isEqualTo(1);
		assertThat(refreshTokenMapper.markUsed(id, NOW.plusSeconds(30))).isZero();

		assertThat(refreshTokenMapper.lockByTokenHash(tokenHash, NOW).usedAt()).isEqualTo(NOW);
	}

	@Test
	@DisplayName("deleteUnusableByUserId は、その人の期限切れの行と、usedBefore 以前に使った行だけを消す")
	void deleteUnusableByUserIdRemovesExpiredAndOldUsed() {
		UUID userId = createUser();
		UUID otherUserId = createUser();
		String expired = hash();
		String usedExactlyAtBoundary = hash();
		String usedJustInsideGrace = hash();
		String unusedAndValid = hash();
		String othersExpired = hash();
		refreshTokenMapper.insert(userId, expired, NOW.minusDays(1));
		refreshTokenMapper.insert(userId, usedExactlyAtBoundary, NOW.plusDays(1));
		refreshTokenMapper.insert(userId, usedJustInsideGrace, NOW.plusDays(1));
		refreshTokenMapper.insert(userId, unusedAndValid, NOW.plusDays(1));
		refreshTokenMapper.insert(otherUserId, othersExpired, NOW.minusDays(1));
		jdbcTemplate.update("UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ?",
				NOW.minusSeconds(60), usedExactlyAtBoundary);
		jdbcTemplate.update("UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ?",
				NOW.minusSeconds(59), usedJustInsideGrace);

		assertThat(refreshTokenMapper.deleteUnusableByUserId(userId, NOW, NOW.minusSeconds(60))).isEqualTo(2);

		assertThat(count(expired)).isZero();
		assertThat(count(usedExactlyAtBoundary)).isZero();
		assertThat(count(usedJustInsideGrace)).isEqualTo(1);
		assertThat(count(unusedAndValid)).isEqualTo(1);
		assertThat(count(othersExpired)).isEqualTo(1);
	}

	@Test
	@DisplayName("使用済みの行も、利用者を消すと一緒に消える")
	void deletingUserCascadesToUsedRows() {
		UUID userId = createUser();
		String tokenHash = hash();
		refreshTokenMapper.insert(userId, tokenHash, NOW.plusDays(30));
		refreshTokenMapper.markUsed(refreshTokenMapper.lockByTokenHash(tokenHash, NOW).id(), NOW);

		jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);

		assertThat(refreshTokenMapper.lockByTokenHash(tokenHash, NOW)).isNull();
		assertThat(count(tokenHash)).isZero();
	}

	private int count(String tokenHash) {
		Integer count = jdbcTemplate.queryForObject(
				"SELECT count(*) FROM refresh_tokens WHERE token_hash = ?", Integer.class, tokenHash);
		return count == null ? 0 : count;
	}

}

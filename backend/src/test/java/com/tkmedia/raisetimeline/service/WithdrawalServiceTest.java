package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.error.InvalidPasswordException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.ImageCleaner;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

/**
 * 退会の順序（照合 → 押さえる → 集める → 消す → コミット後に S3）を、Mockito で確かめる。
 *
 * <p>{@code user.withdrew} のログは、JSON のログが Spring の文脈の中でだけ出るので、ここでは読まない
 * （{@code WithdrawalIntegrationTest} が確かめる）。
 */
class WithdrawalServiceTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final String PASSWORD = "correct-horse-1";
	private static final String HASH = "$2a$04$stored-hash";
	private static final List<String> KEYS = List.of("posts/a.png", "avatars/x/b.png");

	private final UserMapper userMapper = mock(UserMapper.class);
	private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
	private final ImageCleaner imageCleaner = mock(ImageCleaner.class);
	private final RecordingTransactions transactions = new RecordingTransactions();
	private final WithdrawalService service = new WithdrawalService(userMapper, passwordEncoder, imageCleaner,
			transactions);

	private static User user() {
		OffsetDateTime now = OffsetDateTime.parse("2026-10-10T00:00:00Z");
		return new User(USER_ID, "taro_1", "太郎", "taro@example.com", HASH, "", null, now, now);
	}

	private void stubExistingUserWithPassword(boolean matches) {
		when(userMapper.findById(USER_ID)).thenReturn(Optional.of(user()));
		when(passwordEncoder.matches(PASSWORD, HASH)).thenReturn(matches);
	}

	@Test
	@DisplayName("パスワードが違えば InvalidPasswordException で、行を押さえず、消さず、S3 も触らない")
	void wrongPasswordTouchesNothing() {
		stubExistingUserWithPassword(false);

		assertThatThrownBy(() -> service.withdraw(USER_ID, PASSWORD)).isInstanceOf(InvalidPasswordException.class);

		verify(userMapper).findById(USER_ID);
		verifyNoMoreInteractions(userMapper);
		verifyNoInteractions(imageCleaner);
		assertThat(transactions.executions).isZero();
	}

	@Test
	@DisplayName("findById で本人がいなければ 401 で、照合しない")
	void missingUserIsUnauthenticatedWithoutMatching() {
		when(userMapper.findById(USER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.withdraw(USER_ID, PASSWORD)).isInstanceOf(UnauthenticatedException.class);

		verify(userMapper).findById(USER_ID);
		verifyNoInteractions(passwordEncoder, imageCleaner);
		verifyNoMoreInteractions(userMapper);
		assertThat(transactions.executions).isZero();
	}

	@Test
	@DisplayName("lockById が空なら 401 で、消さず、S3 も触らない")
	void lockMissIsUnauthenticated() {
		stubExistingUserWithPassword(true);
		when(userMapper.lockById(USER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.withdraw(USER_ID, PASSWORD)).isInstanceOf(UnauthenticatedException.class);

		verify(userMapper).findById(USER_ID);
		verify(userMapper).lockById(USER_ID);
		verifyNoMoreInteractions(userMapper);
		verifyNoInteractions(imageCleaner);
	}

	@Test
	@DisplayName("正しいパスワードなら、押さえる・キーを集める・消すを 1 回のトランザクションの中で行い、コミットの後に集めたキーを deleteQuietly に渡す")
	void withdrawsInOneTransactionThenCleansStorage() {
		stubExistingUserWithPassword(true);
		List<Boolean> calls = new ArrayList<>();
		when(userMapper.lockById(USER_ID)).thenAnswer(i -> {
			calls.add(transactions.active);
			return Optional.of(USER_ID);
		});
		when(userMapper.findImageKeysOf(USER_ID)).thenAnswer(i -> {
			calls.add(transactions.active);
			return KEYS;
		});
		when(userMapper.deleteById(USER_ID)).thenAnswer(i -> {
			calls.add(transactions.active);
			return 1;
		});
		doAnswer(i -> {
			calls.add(transactions.active);
			return null;
		}).when(imageCleaner).deleteQuietly(any());

		service.withdraw(USER_ID, PASSWORD);

		// lockById・findImageKeysOf・deleteById は中、deleteQuietly は外。
		assertThat(calls).containsExactly(true, true, true, false);
		assertThat(transactions.executions).isEqualTo(1);
		verify(imageCleaner).deleteQuietly(KEYS);
	}

	@Test
	@DisplayName("照合はトランザクションの外で行う")
	void matchesOutsideTransaction() {
		when(userMapper.findById(USER_ID)).thenReturn(Optional.of(user()));
		List<Boolean> calls = new ArrayList<>();
		when(passwordEncoder.matches(PASSWORD, HASH)).thenAnswer(i -> {
			calls.add(transactions.active);
			return true;
		});
		when(userMapper.lockById(USER_ID)).thenReturn(Optional.of(USER_ID));
		when(userMapper.findImageKeysOf(USER_ID)).thenReturn(List.of());

		service.withdraw(USER_ID, PASSWORD);

		assertThat(calls).containsExactly(false);
	}

	@Test
	@DisplayName("deleteById が例外を投げたら、そのまま投げ、S3 は触らない")
	void deleteFailureIsRethrownWithoutTouchingStorage() {
		stubExistingUserWithPassword(true);
		when(userMapper.lockById(USER_ID)).thenReturn(Optional.of(USER_ID));
		when(userMapper.findImageKeysOf(USER_ID)).thenReturn(KEYS);
		IllegalStateException failure = new IllegalStateException("db down");
		when(userMapper.deleteById(USER_ID)).thenThrow(failure);

		assertThatThrownBy(() -> service.withdraw(USER_ID, PASSWORD)).isSameAs(failure);

		verifyNoInteractions(imageCleaner);
	}

	/** トランザクションの中にいる間だけ {@code active} が true になる、記録用の {@link TransactionOperations}。 */
	private static final class RecordingTransactions implements TransactionOperations {

		boolean active;
		int executions;

		@Override
		public <T> T execute(TransactionCallback<T> action) {
			executions++;
			active = true;
			try {
				return action.doInTransaction(new SimpleTransactionStatus());
			} finally {
				active = false;
			}
		}

	}

}

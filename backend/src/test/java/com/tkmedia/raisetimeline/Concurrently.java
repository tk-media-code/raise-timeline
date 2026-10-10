package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** 同時実行のテストの道具。{@code @Transactional} を付けない結合テストが共用する。 */
final class Concurrently {

	private static final long TIMEOUT_SECONDS = 30;

	private Concurrently() {
	}

	/**
	 * 2 つの処理を、開始の合図をそろえて別スレッドから同時に走らせ、返した値（HTTP の status）を集める。
	 * 待ちには時間切れを付け、デッドロックしてもビルドが止まらず失敗になるようにする。
	 */
	@SafeVarargs
	static List<Integer> run(Callable<Integer>... tasks) throws Exception {
		ExecutorService executor = Executors.newFixedThreadPool(tasks.length);
		try {
			CountDownLatch ready = new CountDownLatch(tasks.length);
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> futures = new ArrayList<>();
			for (Callable<Integer> task : tasks) {
				futures.add(executor.submit(() -> {
					ready.countDown();
					start.await();
					return task.call();
				}));
			}
			assertThat(ready.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();
			start.countDown();
			List<Integer> results = new ArrayList<>();
			for (Future<Integer> future : futures) {
				results.add(future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS));
			}
			return results;
		} finally {
			executor.shutdownNow();
		}
	}

}

package com.tkmedia.raisetimeline.image;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * テスト用の画像の保存先。どこにも保存せず、メモリに持つ。
 *
 * <p>S3 に出ないので、サービスや統合のテストが「何が保存され、何が消されたか」を確かめられる。
 * 失敗の注入（{@link #failPutOn} と {@link #failDeletes}）で、保存や削除が壊れたときの振る舞いも確かめる。
 * テストは 1 つずつ走るので、状態は {@link #clear()} で空に戻す。
 */
public class InMemoryImageStorage implements ImageStorage {

	/** 保存された 1 件。 */
	public record Stored(byte[] content, String contentType) {
	}

	private final Map<String, Stored> objects = new LinkedHashMap<>();
	private final List<String> deletedKeys = new ArrayList<>();
	private int putCalls;
	private int failPutOnCall;
	private boolean failDeletes;

	@Override
	public boolean isAvailable() {
		return true;
	}

	@Override
	public synchronized String put(String key, byte[] content, String contentType) {
		putCalls++;
		if (putCalls == failPutOnCall) {
			throw new IllegalStateException("テスト用に保存を失敗させた: " + putCalls + " 回目");
		}
		objects.put(key, new Stored(content.clone(), contentType));
		return urlOf(key);
	}

	@Override
	public synchronized void deleteAll(List<String> keys) {
		if (failDeletes) {
			throw new IllegalStateException("テスト用に削除を失敗させた");
		}
		for (String key : keys) {
			objects.remove(key);
			deletedKeys.add(key);
		}
	}

	@Override
	public String urlOf(String key) {
		return "https://images.test/" + key;
	}

	/** いま保存されているもの（コピー）。 */
	public synchronized Map<String, Stored> objects() {
		return new LinkedHashMap<>(objects);
	}

	/** 削除を頼まれたキーを、頼まれた順に。 */
	public synchronized List<String> deletedKeys() {
		return List.copyOf(deletedKeys);
	}

	/** 数えはじめてから {@code nthCall} 回目の {@code put} を例外にする（1 始まり）。 */
	public synchronized void failPutOn(int nthCall) {
		this.putCalls = 0;
		this.failPutOnCall = nthCall;
	}

	/** これ以降の {@code deleteAll} を例外にする。 */
	public synchronized void failDeletes() {
		this.failDeletes = true;
	}

	/** 保存物・削除の記録・失敗の注入を、すべて初期状態に戻す。 */
	public synchronized void clear() {
		objects.clear();
		deletedKeys.clear();
		putCalls = 0;
		failPutOnCall = 0;
		failDeletes = false;
	}

}

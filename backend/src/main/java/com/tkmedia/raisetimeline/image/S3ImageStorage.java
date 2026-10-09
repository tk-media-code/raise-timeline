package com.tkmedia.raisetimeline.image;

import java.util.ArrayList;
import java.util.List;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Error;

/** S3 に画像を置く保存先。{@link S3Client} への薄い橋渡しにとどめる。 */
public class S3ImageStorage implements ImageStorage {

	/** 配信先（ブラウザや CDN）に 1 年キャッシュさせる。キーは毎回新しく作るので、中身は変わらない（immutable）。 */
	private static final String CACHE_CONTROL = "public, max-age=31536000, immutable";

	/** {@code DeleteObjects} が 1 回で受け付ける件数の上限。 */
	private static final int DELETE_BATCH_SIZE = 1000;

	private final S3Client client;
	private final String bucket;
	private final String publicBaseUrl;

	public S3ImageStorage(S3Client client, String bucket, String publicBaseUrl) {
		this.client = client;
		this.bucket = bucket;
		this.publicBaseUrl = trimTrailingSlashes(publicBaseUrl);
	}

	@Override
	public boolean isAvailable() {
		return true;
	}

	@Override
	public String put(String key, byte[] content, String contentType) {
		PutObjectRequest request = PutObjectRequest.builder()
				.bucket(bucket)
				.key(key)
				.contentType(contentType)
				.cacheControl(CACHE_CONTROL)
				.build();
		client.putObject(request, RequestBody.fromBytes(content));
		return urlOf(key);
	}

	/**
	 * 1,000 件ずつ消す。応答に {@code errors} があれば（SDK は例外にせず応答に載せる）、残りの束も試したうえで
	 * 最後に例外にする。1 つの束の失敗で、ほかの束まで消し残さないため。
	 */
	@Override
	public void deleteAll(List<String> keys) {
		List<String> failedKeys = new ArrayList<>();
		for (int from = 0; from < keys.size(); from += DELETE_BATCH_SIZE) {
			List<String> batch = keys.subList(from, Math.min(from + DELETE_BATCH_SIZE, keys.size()));
			List<ObjectIdentifier> objects = batch.stream()
					.map(key -> ObjectIdentifier.builder().key(key).build())
					.toList();
			DeleteObjectsResponse response = client.deleteObjects(DeleteObjectsRequest.builder()
					.bucket(bucket)
					.delete(Delete.builder().objects(objects).quiet(true).build())
					.build());
			for (S3Error error : response.errors()) {
				failedKeys.add(error.key());
			}
		}
		if (!failedKeys.isEmpty()) {
			// 例外の文言にキーを入れるのは、ログに残る手がかりになるため（キーは乱数で、個人情報を含まない）。
			throw new IllegalStateException("S3 の削除に失敗したキーがある: " + failedKeys);
		}
	}

	@Override
	public String urlOf(String key) {
		return publicBaseUrl + "/" + key;
	}

	private static String trimTrailingSlashes(String url) {
		int end = url.length();
		while (end > 0 && url.charAt(end - 1) == '/') {
			end--;
		}
		return url.substring(0, end);
	}

}

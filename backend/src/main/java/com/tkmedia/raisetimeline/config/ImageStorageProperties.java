package com.tkmedia.raisetimeline.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 画像の保存先の設定値。{@code application.properties} の {@code image-storage.*} を受け取る。
 *
 * <p>認証情報（アクセスキー）はここに持たない。AWS SDK の標準の探索順（環境変数 → … → インスタンスロール）に任せる。
 *
 * @param bucket 保存先のバケット名。空なら画像の機能は使えない（{@code DisabledImageStorage}）
 * @param publicBaseUrl 公開 URL の基点（S3 の URL、または CloudFront の URL）
 * @param region バケットのリージョン
 */
@ConfigurationProperties("image-storage")
public record ImageStorageProperties(String bucket, String publicBaseUrl, String region) {

	/**
	 * バケットがあるのに公開 URL の基点が無ければ、起動時に止める。
	 *
	 * <p>そのまま動かすと、保存はできても URL が作れず、投稿を取るたびに壊れた URL を返してしまう。
	 * 両方とも空なら、画像を使わない環境として通す。
	 */
	public ImageStorageProperties {
		if (isPresent(bucket) && !isPresent(publicBaseUrl)) {
			throw new IllegalStateException("環境変数 S3_PUBLIC_BASE_URL が未設定です");
		}
	}

	private static boolean isPresent(String value) {
		return value != null && !value.isBlank();
	}

}

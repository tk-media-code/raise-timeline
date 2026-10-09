package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Error;

class S3ImageStorageTest {

	private final S3Client client = mock(S3Client.class);

	@Test
	@DisplayName("put は bucket・key・Content-Type・Cache-Control を渡し、公開 URL を返す")
	void putSendsMetadataAndReturnsUrl() {
		S3ImageStorage storage = new S3ImageStorage(client, "b", "https://b.example");

		String url = storage.put("posts/x.png", new byte[] { 1, 2, 3 }, "image/png");

		ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
		verify(client).putObject(request.capture(), any(RequestBody.class));
		assertThat(request.getValue().bucket()).isEqualTo("b");
		assertThat(request.getValue().key()).isEqualTo("posts/x.png");
		assertThat(request.getValue().contentType()).isEqualTo("image/png");
		assertThat(request.getValue().cacheControl()).isEqualTo("public, max-age=31536000, immutable");
		assertThat(url).isEqualTo("https://b.example/posts/x.png");
	}

	@Test
	@DisplayName("基点の末尾に / があっても、URL は同じになる")
	void trailingSlashOfBaseUrlIsNormalized() {
		S3ImageStorage withSlash = new S3ImageStorage(client, "b", "https://b.example/");
		S3ImageStorage withManySlashes = new S3ImageStorage(client, "b", "https://b.example///");

		assertThat(withSlash.urlOf("posts/x.png")).isEqualTo("https://b.example/posts/x.png");
		assertThat(withManySlashes.urlOf("posts/x.png")).isEqualTo("https://b.example/posts/x.png");
		assertThat(withSlash.put("posts/x.png", new byte[] { 1 }, "image/png"))
				.isEqualTo("https://b.example/posts/x.png");
	}

	@Test
	@DisplayName("使える保存先として名乗る")
	void isAvailable() {
		assertThat(new S3ImageStorage(client, "b", "https://b.example").isAvailable()).isTrue();
	}

	@Test
	@DisplayName("deleteAll に 1,001 件渡すと、DeleteObjects は 1,000 件と 1 件の 2 回になる")
	void deleteAllSplitsAtOneThousand() {
		when(client.deleteObjects(any(DeleteObjectsRequest.class)))
				.thenReturn(DeleteObjectsResponse.builder().build());
		S3ImageStorage storage = new S3ImageStorage(client, "b", "https://b.example");
		List<String> keys = IntStream.range(0, 1001).mapToObj(i -> "posts/" + i + ".png").toList();

		storage.deleteAll(keys);

		ArgumentCaptor<DeleteObjectsRequest> requests = ArgumentCaptor.forClass(DeleteObjectsRequest.class);
		verify(client, times(2)).deleteObjects(requests.capture());
		List<DeleteObjectsRequest> sent = requests.getAllValues();
		assertThat(sent.get(0).bucket()).isEqualTo("b");
		assertThat(sent.get(0).delete().objects()).hasSize(1000);
		assertThat(sent.get(1).delete().objects()).hasSize(1);
		List<String> sentKeys = new ArrayList<>();
		sent.forEach(r -> r.delete().objects().forEach(o -> sentKeys.add(o.key())));
		assertThat(sentKeys).containsExactlyElementsOf(keys);
	}

	@Test
	@DisplayName("deleteAll が空なら、S3 を呼ばない")
	void deleteAllWithEmptyListDoesNothing() {
		S3ImageStorage storage = new S3ImageStorage(client, "b", "https://b.example");

		storage.deleteAll(List.of());

		verifyNoInteractions(client);
	}

	@Test
	@DisplayName("応答に errors があれば、削除に失敗したものとして例外にする")
	void deleteAllThrowsWhenResponseHasErrors() {
		when(client.deleteObjects(any(DeleteObjectsRequest.class))).thenReturn(DeleteObjectsResponse.builder()
				.errors(S3Error.builder().key("posts/a.png").code("AccessDenied").build())
				.build());
		S3ImageStorage storage = new S3ImageStorage(client, "b", "https://b.example");

		assertThatThrownBy(() -> storage.deleteAll(List.of("posts/a.png")))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	@DisplayName("1 回目の束で errors があっても、残りの束は送り、最後に例外にする")
	void deleteAllContinuesAfterFailedBatchThenThrows() {
		when(client.deleteObjects(any(DeleteObjectsRequest.class))).thenReturn(DeleteObjectsResponse.builder()
				.errors(S3Error.builder().key("posts/0.png").code("InternalError").build())
				.build());
		S3ImageStorage storage = new S3ImageStorage(client, "b", "https://b.example");
		List<String> keys = IntStream.range(0, 1001).mapToObj(i -> "posts/" + i + ".png").toList();

		assertThatThrownBy(() -> storage.deleteAll(keys)).isInstanceOf(IllegalStateException.class);

		// 消せるものは消しておく（1 つの束の失敗で、ほかの束まで消し残さない）。
		verify(client, times(2)).deleteObjects(any(DeleteObjectsRequest.class));
	}

}

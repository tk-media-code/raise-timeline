package com.tkmedia.raisetimeline.error;

import org.apache.catalina.connector.ClientAbortException;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

/**
 * 例外が「この要求の接続が切れた」ことを表すかを判定する。例外ハンドラ（MVC の中）と
 * {@code RequestLogFilter}（MVC の外）の両方が同じ基準を使うよう、1 か所にまとめる。
 */
public final class ClientDisconnects {

	/** 原因の連鎖をたどる深さの上限。循環していても止まるようにするための値。 */
	private static final int MAX_CAUSE_DEPTH = 20;

	private ClientDisconnects() {
	}

	/**
	 * この要求の接続が切れたことを、例外の型で判定する。原因の連鎖をたどり、
	 * Tomcat の {@link ClientAbortException} か Spring の {@link AsyncRequestNotUsableException} があれば切断とする。
	 *
	 * <p>Spring の {@code DisconnectedClientHelper} を使わないのは、あれが例外の文言（"broken pipe"）と
	 * {@code EOFException} でも判定するため。DB の再起動や S3 への PUT の失敗といったサーバー側の失敗も
	 * 同じ文言や例外を出すので、切断と見なすと本物の失敗が 200 の空の応答になり、ERROR も出なくなる。
	 * Tomcat が {@code ClientAbortException} を投げるのは、この要求の接続が失敗したときだけ。
	 */
	public static boolean isClientDisconnect(Throwable ex) {
		// 原因が自分自身を指す連鎖で止まらなくならないよう、たどる深さに上限を置く。
		Throwable current = ex;
		for (int hops = 0; current != null && hops < MAX_CAUSE_DEPTH; hops++) {
			if (current instanceof ClientAbortException || current instanceof AsyncRequestNotUsableException) {
				return true;
			}
			current = current.getCause();
		}
		return false;
	}

}

package com.tkmedia.raisetimeline.logging;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.boot.test.system.CapturedOutput;

/**
 * 標準出力に出たログ行を JSON として読むテスト用の道具。
 *
 * <p>ログは 1 行 1 件の JSON。波括弧 { で始まらない行（Gradle や JUnit の出力など）は飛ばす。
 * 波括弧 { で始まるのに JSON として読めない行は、ログ行が壊れている印なので、その行を載せて失敗させる。
 */
public final class LogLines {

	private LogLines() {
	}

	public static List<Map<String, Object>> parse(CapturedOutput output) {
		List<Map<String, Object>> lines = new ArrayList<>();
		for (String line : output.getOut().split("\\R")) {
			if (!line.startsWith("{")) {
				continue;
			}
			try {
				lines.add(JsonParserFactory.getJsonParser().parseMap(line));
			} catch (RuntimeException e) {
				throw new AssertionError("JSON として読めないログ行がある: " + line, e);
			}
		}
		return lines;
	}

	/** ドット区切りのパスで入れ子の Map を辿る（{@code http.request.id} は {@code http → request → id}）。無ければ null。 */
	public static Object get(Map<String, Object> line, String dottedPath) {
		Object current = line;
		for (String key : dottedPath.split("\\.")) {
			if (!(current instanceof Map<?, ?> map)) {
				return null;
			}
			current = map.get(key);
		}
		return current;
	}

	public static List<Map<String, Object>> withAction(List<Map<String, Object>> lines, String action) {
		return lines.stream()
				.filter(line -> action.equals(get(line, "event.action")))
				.toList();
	}

}

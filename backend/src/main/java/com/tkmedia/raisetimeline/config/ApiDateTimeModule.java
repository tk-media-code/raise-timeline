package com.tkmedia.raisetimeline.config;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;
import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.std.StdSerializer;

/**
 * API が返す日時の形を、{@code 2026-10-09T07:36:14Z}（UTC・秒まで）にそろえる。
 *
 * <p>API の規約は「秒まで」で、PostgreSQL の {@code timestamptz} が持つマイクロ秒が応答に漏れていただけ。
 * UTC に直すのは、DB の接続のタイムゾーンによって {@code +09:00} と {@code Z} が入れ替わらないようにするため。
 * 小数秒は切り上げずに切り捨てる（切り上げると、まだ来ていない秒の時刻を返してしまう）。
 *
 * <p>整えるのは書き出すときだけで、DB の値は丸めない。「編集済み」は作成と更新の時刻の比較で決まるので、
 * 保存の時点で秒に丸めると、同じ秒の中での編集が「編集済み」にならず消えてしまう。
 *
 * <p>Spring Boot は {@code JacksonModule} の Bean を JsonMapper に自動で組み込む。{@code @Configuration} の
 * {@code @Bean} ではなく {@code @Component} にしているのは、{@code @WebMvcTest} のスライスにも入れるため。
 */
@Component
public final class ApiDateTimeModule extends SimpleModule {

	private static final long serialVersionUID = 1L;

	private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ssXXX");

	public ApiDateTimeModule() {
		super("ApiDateTimeModule");
		addSerializer(OffsetDateTime.class, new SecondsSerializer());
	}

	private static final class SecondsSerializer extends StdSerializer<OffsetDateTime> {

		SecondsSerializer() {
			super(OffsetDateTime.class);
		}

		@Override
		public void serialize(OffsetDateTime value, JsonGenerator generator, SerializationContext context) {
			generator.writeString(FORMAT.format(
					value.withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.SECONDS)));
		}

	}

}

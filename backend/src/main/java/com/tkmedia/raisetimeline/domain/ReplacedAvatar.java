package com.tkmedia.raisetimeline.domain;

import java.util.UUID;

/**
 * アイコンのキーを差し替えたときの結果。{@code oldKey} は差し替え前のキーで、初めて設定したときは null。
 *
 * <p>{@code userId} を一緒に返すのは、{@code oldKey} だけを返す SQL だと、初めての設定で行の全部の列が null になり、
 * MyBatis が行ごと null にしてしまうため（「更新できなかった」と区別できなくなる）。
 */
public record ReplacedAvatar(UUID userId, String oldKey) {
}

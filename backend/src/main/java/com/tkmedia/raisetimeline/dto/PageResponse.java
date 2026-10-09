package com.tkmedia.raisetimeline.dto;

import java.util.List;
import java.util.UUID;

/**
 * カーソル方式の一覧の 1 ページ分。
 *
 * @param items 新しい順に並んだ、このページの要素
 * @param nextCursor 次のページを取るときに {@code cursor} に渡す id。続きが無ければ null で、JSON にも
 *        {@code "nextCursor": null} として出す（画面が鍵の有無でなく値で終わりを判断できるように）
 */
public record PageResponse<T>(List<T> items, UUID nextCursor) {
}

// タイムラインの一覧のキー。root は種類にかかわらず全部、all は「すべて」だけを指す。
export const timelineKeys = {
  root: ['timeline'] as const,
  all: ['timeline', 'all'] as const,
}

export function postKey(id: string) {
  return ['post', id] as const
}

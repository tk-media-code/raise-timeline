import { InfiniteList } from '../../components/InfiniteList'
import { CommentForm } from './CommentForm'
import { CommentItem } from './CommentItem'
import { useComments } from './useComments'

type CommentSectionProps = {
  postId: string
  onPostGone: () => void
}

// 投稿詳細のコメントの節。フォーム → 一覧の順に並べる。
export function CommentSection({ postId, onPostGone }: CommentSectionProps) {
  const query = useComments(postId)

  return (
    <section aria-label="コメント">
      <CommentForm postId={postId} onPostGone={onPostGone} />
      <InfiniteList
        query={query}
        getKey={(comment) => comment.id}
        renderItem={(comment) => <CommentItem comment={comment} postId={postId} />}
        emptyMessage="まだコメントがありません"
        label="コメント一覧"
      />
    </section>
  )
}

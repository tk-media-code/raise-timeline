import { useId, useState } from 'react'
import { WithdrawDialog } from './WithdrawDialog'
import { WITHDRAW_WARNING } from './withdrawText'

// プロフィール編集画面の末尾。取り返しのつかない操作なので、区切り線と赤いボタンでほかの項目から離す。
// スマホ幅の下の余白（mb-20）は、右下の投稿ボタンが「退会する」に重ならないため。
export function WithdrawSection() {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby={titleId} className="mx-4 mt-4 mb-20 flex flex-col gap-3 border-t border-gray-200 pt-4 md:mb-4">
      <h2 id={titleId} className="text-lg font-bold">
        退会
      </h2>
      <p className="text-sm text-gray-700">{WITHDRAW_WARNING}</p>
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 min-w-11 rounded-md bg-red-600 px-4 font-bold text-white hover:bg-red-700 focus:outline-2 focus:outline-offset-2 focus:outline-red-600"
        >
          退会する
        </button>
      </div>
      <WithdrawDialog open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

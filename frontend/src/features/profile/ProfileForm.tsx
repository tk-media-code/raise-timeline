import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Me } from '../../api/auth'
import { ApiError, formatErrorMessage } from '../../api/client'
import type { ProfileInput } from '../../api/users'
import { Avatar } from '../../components/Avatar'
import { TextField } from '../../components/TextField'
import { useToast } from '../../components/Toast'
import { validateDisplayName } from '../auth/validation'
import { failureMessage } from '../posts/mutations'
import { useIsMounted } from '../posts/useIsMounted'
import { BioField } from './BioField'
import { useUpdateProfile } from './mutations'
import { bioRemaining } from './validation'

type FieldErrors = Partial<Record<keyof ProfileInput, string>>

function isField(name: string): name is keyof ProfileInput {
  return name === 'displayName' || name === 'bio'
}

// 表示名と自己紹介の編集フォーム。最初の値は、画面が取り直した me（開くたびに取り直す理由は ProfileEditPage）。
// 変えられるのはこの 2 つだけ。ユーザー名とメールアドレスは見せるだけ（変更の画面は無い）。
export function ProfileForm({ me }: { me: Me }) {
  const [displayName, setDisplayName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio)
  const [errors, setErrors] = useState<FieldErrors>({})
  // 項目に結べないサーバーの誤り。フォームの上部に出す。
  const [formError, setFormError] = useState<string | null>(null)
  const update = useUpdateProfile()
  const toast = useToast()
  const navigate = useNavigate()
  // isPending の反映は少し遅れるので、素早い 2 回目の押下は ref で止める。
  const submitting = useRef(false)
  const mounted = useIsMounted()

  // 元の値から変わっていて、自己紹介が上限内で、送信中でないときだけ押せる。
  // 表示名の誤りは、押したときに欄の下へ出す（登録画面と同じ）。
  const changed = displayName !== me.displayName || bio !== me.bio
  const canSubmit = changed && bioRemaining(bio) >= 0 && !update.isPending

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitting.current) return
    setFormError(null)
    // 表示名は前後の空白を取り除いて送る（登録と同じ）。自己紹介は入力のまま。サーバーが整える。
    const trimmed = displayName.trim()
    const displayNameError = validateDisplayName(trimmed)
    setErrors(displayNameError ? { displayName: displayNameError } : {})
    if (displayNameError) return

    submitting.current = true
    let saved: Me
    try {
      saved = await update.mutateAsync({ displayName: trimmed, bio })
    } catch (error) {
      reportFailure(error)
      return
    } finally {
      submitting.current = false
    }
    toast.show('保存しました')
    // 送信中に画面を離れていたら移動しない（離れた先から引き戻さない）。
    // 差し替えとキャッシュの更新は、mutation の onSuccess で済んでいる。
    if (mounted.current) void navigate(`/users/${saved.username}`, { replace: true })
  }

  function reportFailure(error: unknown) {
    if (!(error instanceof ApiError) || error.status !== 422) {
      // 入力は残す。そのまま、もう一度送れるように。
      toast.show(failureMessage(error), 'error')
      return
    }
    const fieldErrors: FieldErrors = {}
    let unmatched = false
    for (const { field, message } of error.errors) {
      if (isField(field)) fieldErrors[field] = message
      else unmatched = true
    }
    if (!mounted.current) {
      // 送信中に離れた。誤りを見せる欄が無いので、通知で伝える。
      toast.show(error.errors[0]?.message ?? formatErrorMessage(error), 'error')
      return
    }
    setErrors(fieldErrors)
    // errors が空か、項目に結べない field を含むときは、項目の下だけでは利用者に伝わらない。
    if (error.errors.length === 0 || unmatched) setFormError(formatErrorMessage(error))
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-4">
      {formError && (
        <p role="alert" className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      {/* アイコンの変更は後の Issue。今は今のアイコンを見せるだけにして、押しても何もできないボタンは置かない。 */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-black">アイコン</p>
        <Avatar userId={me.id} displayName={displayName || me.displayName} avatarUrl={me.avatarUrl} size={72} />
      </div>
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-black">ユーザー名</dt>
          <dd className="text-gray-700 [overflow-wrap:anywhere]">{`@${me.username}`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-black">メールアドレス</dt>
          <dd className="text-gray-700 [overflow-wrap:anywhere]">{me.email}</dd>
        </div>
      </dl>
      <TextField
        id="profile-display-name"
        label="表示名"
        value={displayName}
        onChange={(value) => {
          setDisplayName(value)
          setErrors((prev) => ({ ...prev, displayName: undefined }))
        }}
        error={errors.displayName}
        autoComplete="nickname"
      />
      <BioField
        id="profile-bio"
        value={bio}
        onChange={(value) => {
          setBio(value)
          setErrors((prev) => ({ ...prev, bio: undefined }))
        }}
        error={errors.bio}
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 min-w-11 rounded-full bg-sky-600 px-6 font-bold text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          保存
        </button>
      </div>
    </form>
  )
}

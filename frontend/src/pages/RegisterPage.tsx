import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { register, type RegisterInput } from '../api/auth'
import { ApiError, splitFieldErrors } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { TextField } from '../components/TextField'
import { validateRegister, type RegisterErrors } from '../features/auth/validation'

// ApiError 以外（想定外の例外）のときの文言。api/client の通信失敗と同じにそろえる。
const UNKNOWN_FAILURE = '通信に失敗しました'

const FIELDS = ['username', 'displayName', 'email', 'password'] as const

function isField(name: string): name is keyof RegisterInput {
  return (FIELDS as readonly string[]).includes(name)
}

export default function RegisterPage() {
  const { signIn } = useAuth()
  const [values, setValues] = useState<RegisterInput>({ username: '', displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState<RegisterErrors>({})
  // 項目に結べないサーバーの誤り（500・通信失敗など）。フォーム上部に出す。
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function setValue(field: keyof RegisterInput) {
    return (value: string) => setValues((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    // 前の送信のサーバーの誤りを引きずらない。入力そのものは消さない。
    setFormError(null)
    // 表示名の前後の空白は、検証の前に取り除き、サーバーにも取り除いた値を送る（docs/features/auth.md 2 章）。
    const input: RegisterInput = { ...values, displayName: values.displayName.trim() }
    const clientErrors = validateRegister(input)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setSubmitting(true)
    try {
      const response = await register(input)
      // 移動はしない。signIn で authenticated になると、RedirectIfAuthenticated が / へ移す。
      signIn(response)
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(UNKNOWN_FAILURE)
        return
      }
      const { fieldErrors, formMessage } = splitFieldErrors(error, isField)
      setErrors(fieldErrors)
      setFormError(formMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 bg-white px-4 py-8 text-black">
      <h1 className="text-2xl font-bold">アカウントを作る</h1>
      {formError && (
        <section aria-label="登録の結果">
          <p role="alert" className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        </section>
      )}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          id="username"
          label="ユーザー名"
          value={values.username}
          onChange={setValue('username')}
          error={errors.username}
          autoComplete="username"
        />
        <TextField
          id="displayName"
          label="表示名"
          value={values.displayName}
          onChange={setValue('displayName')}
          error={errors.displayName}
          autoComplete="nickname"
        />
        <TextField
          id="email"
          label="メールアドレス"
          type="email"
          value={values.email}
          onChange={setValue('email')}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          id="password"
          label="パスワード"
          type="password"
          value={values.password}
          onChange={setValue('password')}
          error={errors.password}
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-md bg-sky-600 px-4 font-medium text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          登録する
        </button>
      </form>
      <p className="text-sm">
        <Link to="/login" className="text-sky-700 underline">
          ログインはこちら
        </Link>
      </p>
    </main>
  )
}

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { login, type AuthResponse, type LoginInput } from '../api/auth'
import { ApiError, formatErrorMessage } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { TextField } from '../components/TextField'
import { validateLogin } from '../features/auth/validation'

// ApiError 以外（想定外の例外）のときの文言。api/client の通信失敗と同じにそろえる。
const UNKNOWN_FAILURE = '通信に失敗しました'
const FORM_ERROR_ID = 'login-error'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [values, setValues] = useState<LoginInput>({ email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({})
  // ログインの失敗は、どちらの項目が違うかを示さないので、項目の下ではなくフォーム上部に出す。
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function setValue(field: keyof LoginInput) {
    return (value: string) => setValues((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    // 前の送信の失敗を引きずらない。入力そのものは消さない。
    setFormError(null)
    const clientErrors = validateLogin(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setSubmitting(true)
    let response: AuthResponse
    try {
      response = await login(values)
    } catch (error) {
      setFormError(error instanceof ApiError ? formatErrorMessage(error) : UNKNOWN_FAILURE)
      return
    } finally {
      setSubmitting(false)
    }
    // signIn は try の外で呼ぶ。中に置くと、signIn 側の不具合が「通信に失敗しました」に化けて見えなくなる。
    // 移動はしない。signIn で authenticated になると、RedirectIfAuthenticated が ?next=（無ければ /）へ移す。
    signIn(response)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 bg-white px-4 py-8 text-black">
      <h1 className="text-2xl font-bold">ログイン</h1>
      {formError && (
        <p id={FORM_ERROR_ID} role="alert" className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-md bg-sky-600 px-4 font-medium text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ログイン
        </button>
      </form>
      <p className="text-sm">
        <Link to="/register" className="text-sky-700 underline">
          アカウントを作る
        </Link>
      </p>
    </main>
  )
}

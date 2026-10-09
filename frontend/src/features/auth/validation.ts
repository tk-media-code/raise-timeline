import type { LoginInput, RegisterInput } from '../../api/auth'
import { countCodePoints } from '../../lib/text'

export type RegisterValues = RegisterInput
export type RegisterErrors = Partial<Record<keyof RegisterValues, string>>

// 文言と規則は docs/features/auth.md 2 章の表と同じ。サーバーの検証も同じ表に従うので、片方だけ変えない。
const USERNAME_MESSAGE = '3〜20 文字の英数字と _ で入力してください'
const DISPLAY_NAME_MESSAGE = '1〜50 文字で入力してください'
const EMAIL_MESSAGE = 'メールアドレスの形式で入力してください'
const PASSWORD_MESSAGE = '8〜72 文字の半角英数字と記号で入力してください'
const REQUIRED_MESSAGE = '入力してください'

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/
// 厳密な RFC の検証はしない。空白を含まない 2 つの部分を @ でつないだものだけを通す。
// サーバーの RegisterRequest.email も同じ正規表現（(?U) で \s を Unicode の空白にして JS とそろえる）と、
// コードポイントで数える 254 文字以内で検証する。同じ例を validation.test.ts と AuthControllerTest の両方に置いてあるので、片方だけ変えない。
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/
const EMAIL_MAX_LENGTH = 254
// 空白を含まない ASCII の可視文字（! から ~）だけ。
const PASSWORD_PATTERN = /^[\x21-\x7E]{8,72}$/

// 表示名の規則。登録とプロフィール編集で同じ判定を使う（片方だけ変わると、登録できた名前に直せなくなる）。
// 前後の空白は取り除いてから数える。空白だけの表示名を 1 文字として通さないため。
// 文字数はコードポイントで数える。`length` だと絵文字が 2 文字になり、サーバーとずれる。
export function validateDisplayName(value: string): string | undefined {
  const length = countCodePoints(value.trim())
  return length < 1 || length > 50 ? DISPLAY_NAME_MESSAGE : undefined
}

export function validateRegister(values: RegisterValues): RegisterErrors {
  const errors: RegisterErrors = {}

  if (!USERNAME_PATTERN.test(values.username)) errors.username = USERNAME_MESSAGE

  const displayNameError = validateDisplayName(values.displayName)
  if (displayNameError) errors.displayName = displayNameError

  if (!EMAIL_PATTERN.test(values.email) || countCodePoints(values.email) > EMAIL_MAX_LENGTH) {
    errors.email = EMAIL_MESSAGE
  }

  if (!PASSWORD_PATTERN.test(values.password)) errors.password = PASSWORD_MESSAGE

  return errors
}

// ログインは「空でないこと」だけを見る。形式や長さまで見ると、登録時の規則が変わったときに
// 古い規則で作った利用者がログインできなくなる。空白だけの入力もサーバーの @NotBlank が 422 にするので、画面でも空と同じに扱う。
export function validateLogin(values: LoginInput): Partial<Record<'email' | 'password', string>> {
  const errors: Partial<Record<'email' | 'password', string>> = {}
  if (values.email.trim() === '') errors.email = REQUIRED_MESSAGE
  if (values.password.trim() === '') errors.password = REQUIRED_MESSAGE
  return errors
}

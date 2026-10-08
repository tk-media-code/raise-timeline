import { describe, expect, it } from 'vitest'
import { validateLogin, validateRegister, type RegisterValues } from './validation'

const valid: RegisterValues = {
  username: 'alice_01',
  displayName: 'アリス',
  email: 'alice@example.com',
  password: 'password1!',
}

const USERNAME_MESSAGE = '3〜20 文字の英数字と _ で入力してください'
const DISPLAY_NAME_MESSAGE = '1〜50 文字で入力してください'
const EMAIL_MESSAGE = 'メールアドレスの形式で入力してください'
const PASSWORD_MESSAGE = '8〜72 文字の半角英数字と記号で入力してください'

describe('validateRegister', () => {
  it('正しい入力なら誤りは無い', () => {
    expect(validateRegister(valid)).toEqual({})
  })

  describe('username', () => {
    it.each([
      ['2 文字', 'ab', USERNAME_MESSAGE],
      ['3 文字', 'abc', undefined],
      ['20 文字', 'a'.repeat(20), undefined],
      ['21 文字', 'a'.repeat(21), USERNAME_MESSAGE],
      ['空', '', USERNAME_MESSAGE],
      ['ハイフンを含む', 'a-b', USERNAME_MESSAGE],
      ['アンダースコアを含む', 'a_b', undefined],
      ['全角英数字', 'ａｂｃ', USERNAME_MESSAGE],
    ])('%s', (_name, username, expected) => {
      expect(validateRegister({ ...valid, username }).username).toBe(expected)
    })
  })

  describe('displayName', () => {
    it.each([
      ['空', '', DISPLAY_NAME_MESSAGE],
      ['空白だけ', ' 　 ', DISPLAY_NAME_MESSAGE],
      ['絵文字 1 文字（コードポイントで 1）', '😀', undefined],
      ['50 文字', 'あ'.repeat(50), undefined],
      ['51 文字', 'あ'.repeat(51), DISPLAY_NAME_MESSAGE],
      ['絵文字 50 個（コード単位では 100）', '😀'.repeat(50), undefined],
      ['絵文字 51 個', '😀'.repeat(51), DISPLAY_NAME_MESSAGE],
      ['前後の空白を除いて 50 文字', ' ' + 'あ'.repeat(50) + ' ', undefined],
    ])('%s', (_name, displayName, expected) => {
      expect(validateRegister({ ...valid, displayName }).displayName).toBe(expected)
    })
  })

  describe('email', () => {
    // 同じ例を backend の AuthControllerTest（registerValidationAccepts / Rejects）にも置いている。片方だけ変えない。
    it.each([
      ['@ が無い', 'alice.example.com', EMAIL_MESSAGE],
      ['空', '', EMAIL_MESSAGE],
      ['@ の前が空', '@example.com', EMAIL_MESSAGE],
      ['@ の後が空', 'alice@', EMAIL_MESSAGE],
      ['ローカル部に空白', 'a b@example.com', EMAIL_MESSAGE],
      ['ドメインに空白', 'alice@exa mple.com', EMAIL_MESSAGE],
      ['@ が 2 つ', 'a@b@example.com', EMAIL_MESSAGE],
      ['ローカル部に連続するドット', 'a..b@example.com', undefined],
      ['ローカル部が 65 文字', 'a'.repeat(65) + '@example.com', undefined],
      ['254 文字', 'a'.repeat(242) + '@example.com', undefined],
      ['255 文字', 'a'.repeat(243) + '@example.com', EMAIL_MESSAGE],
      ['絵文字を含む 254 コードポイント', '😀😀' + 'a'.repeat(240) + '@example.com', undefined],
      ['絵文字を含む 255 コードポイント', '😀😀' + 'a'.repeat(241) + '@example.com', EMAIL_MESSAGE],
    ])('%s', (_name, email, expected) => {
      expect(validateRegister({ ...valid, email }).email).toBe(expected)
    })
  })

  describe('password', () => {
    it.each([
      ['7 文字', 'a'.repeat(7), PASSWORD_MESSAGE],
      ['8 文字', 'a'.repeat(8), undefined],
      ['72 文字', 'a'.repeat(72), undefined],
      ['73 文字', 'a'.repeat(73), PASSWORD_MESSAGE],
      ['空白を含む', 'pass word1', PASSWORD_MESSAGE],
      ['全角文字を含む', 'passwordあ1', PASSWORD_MESSAGE],
      ['記号を含む', 'p@ss!w0rd~', undefined],
    ])('%s', (_name, password, expected) => {
      expect(validateRegister({ ...valid, password }).password).toBe(expected)
    })
  })

  it('複数の項目の誤りをまとめて返す', () => {
    expect(validateRegister({ username: 'a', displayName: '', email: 'x', password: '1' })).toEqual({
      username: USERNAME_MESSAGE,
      displayName: DISPLAY_NAME_MESSAGE,
      email: EMAIL_MESSAGE,
      password: PASSWORD_MESSAGE,
    })
  })
})

describe('validateLogin', () => {
  it('入力があれば誤りは無い', () => {
    expect(validateLogin({ email: 'a@example.com', password: 'x' })).toEqual({})
  })

  it('空の項目に「入力してください」を返す', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: '入力してください',
      password: '入力してください',
    })
  })

  it('ログインではメールアドレスの形式やパスワードの長さまでは見ない', () => {
    expect(validateLogin({ email: 'not-an-email', password: 'a' })).toEqual({})
  })
})

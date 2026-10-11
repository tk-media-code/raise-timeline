import { describe, expect, it } from 'vitest'
import { checkSearchQuery, SEARCH_TOO_LONG } from './searchQuery'

describe('checkSearchQuery', () => {
  it('前後の空白（全角を含む）を除いた q を返す', () => {
    expect(checkSearchQuery('  ali　')).toEqual({ q: 'ali', error: null })
    expect(checkSearchQuery('　a b\t\n')).toEqual({ q: 'a b', error: null })
  })

  it('空と空白だけは q が空で error は null', () => {
    expect(checkSearchQuery('')).toEqual({ q: '', error: null })
    expect(checkSearchQuery(' 　\t')).toEqual({ q: '', error: null })
  })

  it('50 コードポイントは error が null、51 は SEARCH_TOO_LONG', () => {
    expect(checkSearchQuery('a'.repeat(50)).error).toBeNull()
    expect(checkSearchQuery('a'.repeat(51)).error).toBe(SEARCH_TOO_LONG)
    expect(SEARCH_TOO_LONG).toBe('50 文字以内で入力してください')
  })

  it('絵文字 50 個は null、51 個は SEARCH_TOO_LONG（1 個を 1 文字と数える）', () => {
    expect(checkSearchQuery('😀'.repeat(50)).error).toBeNull()
    expect(checkSearchQuery('😀'.repeat(51)).error).toBe(SEARCH_TOO_LONG)
  })

  it('空白を除いたあとで数える（前後の空白は文字数に入れない）', () => {
    expect(checkSearchQuery(` ${'a'.repeat(50)} `)).toEqual({ q: 'a'.repeat(50), error: null })
  })
})

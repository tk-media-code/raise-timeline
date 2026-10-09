import { describe, expect, it } from 'vitest'
import { safeNext } from './safeNext'

describe('safeNext', () => {
  it('/ はそのまま返す', () => {
    expect(safeNext('/')).toBe('/')
  })

  it('同じサイト内のパスはクエリごとそのまま返す', () => {
    expect(safeNext('/users/alice?tab=1')).toBe('/users/alice?tab=1')
  })

  it('// で始まる値は別のサイトを指すので / にする', () => {
    expect(safeNext('//evil.example')).toBe('/')
  })

  it('/\\ で始まる値は // と同じ扱いをするブラウザがあるので / にする', () => {
    expect(safeNext('/\\evil')).toBe('/')
  })

  it('絶対 URL は / にする', () => {
    expect(safeNext('https://x')).toBe('/')
  })

  it('タブを挟んで // を作る値は / にする', () => {
    expect(safeNext('/\t/evil.example')).toBe('/')
  })

  it('改行を挟んで // を作る値は / にする', () => {
    expect(safeNext('/\n/x')).toBe('/')
  })

  it('DEL を含む値は / にする', () => {
    expect(safeNext('/a\u007Fb')).toBe('/')
  })

  it('null と undefined と空文字は / にする', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext('')).toBe('/')
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('avatarUrl があれば画像を出す。表示名は隣にあるので alt は空', () => {
    const { container } = render(<Avatar userId="u1" displayName="アリス" avatarUrl="https://example.com/a.png" />)

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/a.png')
    expect(img).toHaveAttribute('alt', '')
  })

  it('avatarUrl が無ければ表示名の頭文字を出す', () => {
    render(<Avatar userId="u1" displayName="アリス" avatarUrl={null} />)

    expect(screen.getByText('ア')).toBeInTheDocument()
  })

  it('絵文字 1 つの表示名は、サロゲートペアを割らずに絵文字 1 つを出す', () => {
    render(<Avatar userId="u1" displayName="😀" avatarUrl={null} />)

    expect(screen.getByText('😀')).toBeInTheDocument()
  })

  it('同じ id なら、表示名が違っても同じ色になる', () => {
    const { container: a } = render(<Avatar userId="user-1" displayName="アリス" avatarUrl={null} />)
    const { container: b } = render(<Avatar userId="user-1" displayName="ありす（改名）" avatarUrl={null} />)

    expect(a.firstElementChild?.className).toBe(b.firstElementChild?.className)
  })

  it('id が違えば色が変わりうる', () => {
    // 文字コードの和を 8 で割った余りで決まる。'a'(97) は 1、'b'(98) は 2 なので、別の色になる。
    const { container: a } = render(<Avatar userId="a" displayName="同じ名前" avatarUrl={null} />)
    const { container: b } = render(<Avatar userId="b" displayName="同じ名前" avatarUrl={null} />)

    expect(a.firstElementChild?.className).not.toBe(b.firstElementChild?.className)
  })

  it('size を幅と高さに反映する', () => {
    const { container } = render(<Avatar userId="u1" displayName="アリス" avatarUrl={null} size={64} />)

    expect(container.firstElementChild).toHaveStyle({ width: '64px', height: '64px' })
  })
})

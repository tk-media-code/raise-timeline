import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('avatarUrl があれば画像を出す。表示名は隣にあるので alt は空', () => {
    const { container } = render(<Avatar displayName="アリス" avatarUrl="https://example.com/a.png" />)

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/a.png')
    expect(img).toHaveAttribute('alt', '')
  })

  it('avatarUrl が無ければ表示名の頭文字を出す', () => {
    render(<Avatar displayName="アリス" avatarUrl={null} />)

    expect(screen.getByText('ア')).toBeInTheDocument()
  })

  it('絵文字 1 つの表示名は、サロゲートペアを割らずに絵文字 1 つを出す', () => {
    render(<Avatar displayName="😀" avatarUrl={null} />)

    expect(screen.getByText('😀')).toBeInTheDocument()
  })

  it('同じ表示名なら同じ色になる', () => {
    const { container: a } = render(<Avatar displayName="アリス" avatarUrl={null} />)
    const { container: b } = render(<Avatar displayName="アリス" avatarUrl={null} />)

    expect(a.firstElementChild?.className).toBe(b.firstElementChild?.className)
  })

  it('size を幅と高さに反映する', () => {
    const { container } = render(<Avatar displayName="アリス" avatarUrl={null} size={64} />)

    expect(container.firstElementChild).toHaveStyle({ width: '64px', height: '64px' })
  })
})

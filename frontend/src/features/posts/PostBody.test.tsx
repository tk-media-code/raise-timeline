import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostBody } from './PostBody'

describe('PostBody', () => {
  it('改行を保つ', () => {
    const { container } = render(<PostBody body={'1行目\n2行目'} />)

    expect(container.textContent).toBe('1行目\n2行目')
    expect(container.firstElementChild).toHaveClass('whitespace-pre-wrap')
  })

  it('長い URL や英字が続いても折り返す', () => {
    const { container } = render(<PostBody body="aaaaaaaa" />)

    expect(container.firstElementChild).toHaveClass('[overflow-wrap:anywhere]')
  })

  it('URL は新しいタブで開くリンクにする', () => {
    render(<PostBody body="見て https://example.com/a?b=1 です" />)

    const anchor = screen.getByRole('link', { name: 'https://example.com/a?b=1' })
    expect(anchor).toHaveAttribute('href', 'https://example.com/a?b=1')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('<b>太字</b> は要素にならず、文字として出る', () => {
    const { container } = render(<PostBody body="<b>太字</b>" />)

    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toBe('<b>太字</b>')
  })

  it('javascript: はリンクにならない', () => {
    render(<PostBody body="javascript:alert(1)" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
  })
})

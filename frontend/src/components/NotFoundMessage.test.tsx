import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { NotFoundMessage } from './NotFoundMessage'

describe('NotFoundMessage', () => {
  it('見出し、本文、ホームへのリンクを出す。main は持たない', () => {
    render(
      <MemoryRouter>
        <NotFoundMessage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(screen.getByText('お探しの投稿やユーザーは見つかりませんでした')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームへ戻る' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })
})

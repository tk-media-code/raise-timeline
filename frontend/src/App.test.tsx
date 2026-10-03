import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('/ を開くと、ダミーページの見出しと本文が表示される', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'raise-timeline' })).toBeInTheDocument()
    expect(
      screen.getByText('開発環境の構築が完了しました。ここからアプリを作っていきます。'),
    ).toBeInTheDocument()
  })
})

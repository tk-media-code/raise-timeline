import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UserSummary } from '../../api/posts'
import { renderWithProviders } from '../../test/providers'
import { UserLink } from './UserLink'

const alice: UserSummary = { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null }

describe('UserLink', () => {
  it('/users/alice へのリンクで、名前は表示名と @ユーザー名の間に空白を置いた「アリス @alice」になる', () => {
    renderWithProviders(<UserLink user={alice} />)

    const link = screen.getByRole('link', { name: 'アリス @alice' })
    expect(link).toHaveAttribute('href', '/users/alice')
  })

  it('画像が無ければ表示名の頭文字、あれば画像のアイコンを出す', () => {
    const { container, unmount } = renderWithProviders(<UserLink user={alice} />)

    expect(container.querySelector('img')).toBeNull()
    // リンク全体の文字には表示名も入るので、頭文字は丸の中だけを完全一致で見る。
    expect(screen.getByRole('link').querySelector('[aria-hidden="true"]')?.textContent).toBe('ア')
    unmount()

    const { container: withImage } = renderWithProviders(
      <UserLink user={{ ...alice, avatarUrl: 'http://example.test/a.png' }} />,
    )
    expect(withImage.querySelector('img')).toHaveAttribute('src', 'http://example.test/a.png')
  })
})

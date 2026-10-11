import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TabNav } from './TabNav'

function renderTabs() {
  return render(
    <MemoryRouter>
      <TabNav
        label="種類"
        tabs={[
          { to: '/?tab=following', label: 'フォロー中', current: true },
          { to: '/?tab=all', label: 'すべて', current: false },
        ]}
      />
    </MemoryRouter>,
  )
}

describe('TabNav', () => {
  it('渡した名前の nav に、タブがリンクとして並び、to を指す', () => {
    renderTabs()

    const links = within(screen.getByRole('navigation', { name: '種類' })).getAllByRole('link')

    expect(links.map((link) => link.textContent)).toEqual(['フォロー中', 'すべて'])
    expect(links[0]).toHaveAttribute('href', '/?tab=following')
    expect(links[1]).toHaveAttribute('href', '/?tab=all')
  })

  it('current のタブだけが aria-current="page" を持つ', () => {
    renderTabs()

    expect(screen.getByRole('link', { name: 'フォロー中' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'すべて' })).not.toHaveAttribute('aria-current')
  })

  it('どのタブも border-b-2 を持つ（選択中だけ線が付くと、文字の位置が 1px ずれる）', () => {
    renderTabs()

    expect(screen.getByRole('link', { name: 'フォロー中' })).toHaveClass('border-b-2', 'border-sky-600', 'font-bold')
    expect(screen.getByRole('link', { name: 'すべて' })).toHaveClass('border-b-2', 'border-transparent')
    expect(screen.getByRole('link', { name: 'すべて' })).not.toHaveClass('font-bold')
  })
})

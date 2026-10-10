import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/providers'
import { WithdrawSection } from './WithdrawSection'

const api = vi.hoisted(() => ({ withdraw: vi.fn() }))
vi.mock('../../api/users', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

describe('WithdrawSection', () => {
  beforeEach(() => {
    api.withdraw.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', signOutLocally: vi.fn() })
  })

  it('見出し「退会」と説明と「退会する」ボタンがある', () => {
    renderWithProviders(<WithdrawSection />)

    const section = screen.getByRole('region', { name: '退会' })
    expect(screen.getByRole('heading', { level: 2, name: '退会' })).toBeInTheDocument()
    expect(section).toHaveTextContent('退会すると、投稿・コメント・いいね・フォロー・画像がすべて消え、元に戻せません。')
    expect(screen.getByRole('button', { name: '退会する' })).toHaveClass('bg-red-600', 'text-white', 'min-h-11')
  })

  it('開く前は確認ダイアログが見えない', () => {
    renderWithProviders(<WithdrawSection />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('「退会する」を押すと、見出し「本当に退会しますか？」のダイアログが開き、フォーカスは「取り消し」にある', async () => {
    renderWithProviders(<WithdrawSection />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '退会する' }))

    expect(screen.getByRole('dialog', { name: '本当に退会しますか？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取り消し' })).toHaveFocus()
  })

  it('「取り消し」で閉じ、フォーカスは「退会する」に戻る', async () => {
    renderWithProviders(<WithdrawSection />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '退会する' }))

    await user.click(screen.getByRole('button', { name: '取り消し' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退会する' })).toHaveFocus()
  })
})

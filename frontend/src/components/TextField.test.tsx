import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('ラベルで入力欄を引ける', () => {
    render(<TextField id="email" label="メールアドレス" value="a@example.com" onChange={() => {}} />)

    expect(screen.getByLabelText('メールアドレス')).toHaveValue('a@example.com')
  })

  it('error があると role=alert の文言が出て、入力欄が aria-invalid になり説明に結ばれる', () => {
    render(<TextField id="email" label="メールアドレス" value="" onChange={() => {}} error="形式が正しくありません" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('形式が正しくありません')
    expect(alert).toHaveAttribute('id', 'email-error')
    const input = screen.getByLabelText('メールアドレス')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'email-error')
  })

  it('error が無ければ alert も aria-invalid も出ない', () => {
    render(<TextField id="email" label="メールアドレス" value="" onChange={() => {}} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('type と maxLength と autoComplete を入力欄に渡す', () => {
    render(
      <TextField
        id="pw"
        label="パスワード"
        type="password"
        value=""
        onChange={() => {}}
        autoComplete="current-password"
        maxLength={72}
      />,
    )

    const input = screen.getByLabelText('パスワード')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'current-password')
    expect(input).toHaveAttribute('maxlength', '72')
  })
})

import { Link } from 'react-router'

// レイアウトの外に置くので、ナビは出さない。ログインしているかどうかに関わらず開ける。
export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 bg-white px-4 py-8 text-black">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="text-sm">
        <Link to="/" className="text-sky-700 underline">
          ホームへ
        </Link>
      </p>
    </main>
  )
}

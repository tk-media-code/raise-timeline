// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない（入れ子にしない）。
export default function HomePage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-2xl font-bold">ホーム</h2>
      <p className="text-gray-600">タイムラインは次の Issue で作ります</p>
    </div>
  )
}

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない（入れ子にしない）。
export default function HomePage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="text-2xl font-bold max-md:sr-only">ホーム</h1>
      <p className="text-gray-600">タイムラインは次の Issue で作ります</p>
    </div>
  )
}

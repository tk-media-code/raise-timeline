import { linkify } from './linkify'

// 本文。改行は whitespace-pre-wrap で保つ。長い URL や英字の連続は、[overflow-wrap:anywhere] で折り返す（360px で横にはみ出さない）。
export function PostBody({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {linkify(body).map((segment, index) =>
        segment.kind === 'link' ? (
          <a
            key={index}
            href={segment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 underline"
          >
            {segment.url}
          </a>
        ) : (
          segment.text
        ),
      )}
    </p>
  )
}

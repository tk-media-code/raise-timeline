import { describe, expect, it } from 'vitest'
import { linkify, type BodySegment } from './linkify'

const text = (value: string): BodySegment => ({ kind: 'text', text: value })
const link = (url: string): BodySegment => ({ kind: 'link', url })

describe('linkify', () => {
  it.each<[string, string, BodySegment[]]>([
    ['前後の文字は text に残す', 'see https://example.com now', [text('see '), link('https://example.com'), text(' now')]],
    ['クエリとフラグメントを含めて 1 つにする', 'http://a.example/b?c=1#d', [link('http://a.example/b?c=1#d')]],
    ['末尾の . は URL に含めない', 'https://example.com.', [link('https://example.com'), text('.')]],
    ['括弧で囲まれた URL は閉じ括弧を外す', '(https://example.com)', [text('('), link('https://example.com'), text(')')]],
    ['URL の中で対になっている ) は残す', 'https://ja.wikipedia.org/wiki/X_(Y)', [link('https://ja.wikipedia.org/wiki/X_(Y)')]],
    [
      '対になった ) のあとの余分な ) は外す',
      'https://ja.wikipedia.org/wiki/X_(Y))',
      [link('https://ja.wikipedia.org/wiki/X_(Y)'), text(')')],
    ],
    ['全角の句点で切れる', 'https://example.com。次', [link('https://example.com'), text('。次')]],
    ['日本語の文字で切れる', 'https://example.comです', [link('https://example.com'), text('です')]],
    ['改行で切れる', 'https://a.example\nhttps://b.example', [link('https://a.example'), text('\n'), link('https://b.example')]],
    ['末尾の記号が続いても、変わらなくなるまで外す', 'https://example.com/a?!.,;:', [link('https://example.com/a'), text('?!.,;:')]],
    ['. と ) が交互に続いても外す', '(https://example.com/a).)', [text('('), link('https://example.com/a'), text(').)')]],
    ['末尾の ] は外す', '[https://example.com]', [text('['), link('https://example.com'), text(']')]],
    ['末尾の \' は外す', "'https://example.com'", [text("'"), link('https://example.com'), text("'")]],
    ['外した結果、スキームだけになるものはリンクにしない', 'https://.', [text('https://.')]],
    ['空文字は空の配列', '', []],
  ])('%s', (_name, body, expected) => {
    expect(linkify(body)).toEqual(expected)
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'ftp://example.com', 'https://'])(
    '%s はリンクにしない。text 1 つだけ',
    (body) => {
      expect(linkify(body)).toEqual([text(body)])
    },
  )
})

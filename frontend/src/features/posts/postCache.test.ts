import type { InfiniteData } from '@tanstack/react-query'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Page, Post } from '../../api/posts'
import { prependPost, removePost, replacePost } from './postCache'
import { postKey, timelineKeys } from './queryKeys'

type Data = InfiniteData<Page<Post>, string | null>

function makePost(id: string, body = `本文 ${id}`): Post {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body,
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

function twoPages(): Data {
  return {
    pages: [
      { items: [makePost('a'), makePost('b')], nextCursor: 'c2' },
      { items: [makePost('c'), makePost('d')], nextCursor: null },
    ],
    pageParams: [null, 'c2'],
  }
}

function ids(data: Data | undefined, page: number): string[] {
  return data?.pages[page]?.items.map((post) => post.id) ?? []
}

describe('prependPost', () => {
  it('2 ページあるうち、1 ページ目の先頭にだけ足す', () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())

    prependPost(client, makePost('new'))

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(ids(data, 0)).toEqual(['new', 'a', 'b'])
    expect(ids(data, 1)).toEqual(['c', 'd'])
    expect(data?.pages[0]?.nextCursor).toBe('c2')
    expect(data?.pageParams).toEqual([null, 'c2'])
  })

  it('キャッシュが無ければ何もしない（getQueryData は undefined のまま）', () => {
    const client = new QueryClient()

    prependPost(client, makePost('new'))

    expect(client.getQueryData(timelineKeys.all)).toBeUndefined()
  })
})

describe('replacePost', () => {
  it('2 ページ目にある投稿と postKey を置き換える', () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())
    client.setQueryData(postKey('c'), makePost('c'))

    replacePost(client, makePost('c', '直した本文'))

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(data?.pages[1]?.items[0]?.body).toBe('直した本文')
    expect(data?.pages[0]?.items.map((post) => post.body)).toEqual(['本文 a', '本文 b'])
    expect(client.getQueryData<Post>(postKey('c'))?.body).toBe('直した本文')
  })

  it('timelineKeys.root の下にある、ほかの種類の一覧も置き換える', () => {
    const client = new QueryClient()
    client.setQueryData(['timeline', 'following'], twoPages())

    replacePost(client, makePost('a', '直した本文'))

    expect(client.getQueryData<Data>(['timeline', 'following'])?.pages[0]?.items[0]?.body).toBe('直した本文')
  })

  it('postKey のキャッシュが無ければ、作らない', () => {
    const client = new QueryClient()

    replacePost(client, makePost('c'))

    expect(client.getQueryData(postKey('c'))).toBeUndefined()
  })
})

describe('removePost', () => {
  it('すべてのページから除き、postKey を消す', () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())
    client.setQueryData(postKey('c'), makePost('c'))

    removePost(client, 'c')
    removePost(client, 'a')

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(ids(data, 0)).toEqual(['b'])
    expect(ids(data, 1)).toEqual(['d'])
    expect(client.getQueryData(postKey('c'))).toBeUndefined()
  })
})

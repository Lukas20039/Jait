import { describe, expect, it, vi } from 'vitest'

import type { AgentActivityThreadLike } from '@/lib/agent-activity-source'
import { createAgentActivityThreadLoader } from '@/lib/agent-activity-threads'

const thread = (id: string): AgentActivityThreadLike => ({ id, status: 'idle' })

/** Controllable clock so TTL rules need no fake timers. */
function clock(start = 1_000) {
  let value = start
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms
    },
  }
}

describe('createAgentActivityThreadLoader', () => {
  it('reads once and returns the loaded threads', async () => {
    const load = vi.fn(async () => [thread('a')])
    const loader = createAgentActivityThreadLoader({ load })

    await expect(loader.get()).resolves.toEqual([thread('a')])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reuses one snapshot for every caller inside the TTL', async () => {
    const time = clock()
    const load = vi.fn(async () => [thread('a')])
    const loader = createAgentActivityThreadLoader({ load, now: time.now })

    await loader.get()
    time.advance(9_999)
    await loader.get()
    await loader.get()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reads again once the snapshot is older than the TTL', async () => {
    const time = clock()
    const load = vi
      .fn<[], Promise<AgentActivityThreadLike[]>>()
      .mockResolvedValueOnce([thread('a')])
      .mockResolvedValueOnce([thread('a'), thread('b')])
    const loader = createAgentActivityThreadLoader({ load, now: time.now })

    await loader.get()
    time.advance(10_000)

    await expect(loader.get()).resolves.toEqual([thread('a'), thread('b')])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares a single in-flight read between concurrent callers', async () => {
    let release: (threads: AgentActivityThreadLike[]) => void = () => {}
    const load = vi.fn(
      () =>
        new Promise<AgentActivityThreadLike[]>((resolve) => {
          release = resolve
        }),
    )
    const loader = createAgentActivityThreadLoader({ load })

    const first = loader.get()
    const second = loader.get()
    expect(load).toHaveBeenCalledTimes(1)

    release([thread('a')])
    await expect(first).resolves.toEqual([thread('a')])
    await expect(second).resolves.toEqual([thread('a')])
  })

  it('never caches a failed read, so the next caller retries for real', async () => {
    const load = vi
      .fn<[], Promise<AgentActivityThreadLike[]>>()
      .mockRejectedValueOnce(new Error('gateway unavailable'))
      .mockResolvedValueOnce([thread('a')])
    const loader = createAgentActivityThreadLoader({ load })

    await expect(loader.get()).rejects.toThrow('gateway unavailable')
    await expect(loader.get()).resolves.toEqual([thread('a')])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reads again after invalidate() even inside the TTL', async () => {
    const time = clock()
    const load = vi.fn(async () => [thread('a')])
    const loader = createAgentActivityThreadLoader({ load, now: time.now })

    await loader.get()
    loader.invalidate()
    await loader.get()

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not duplicate a request when invalidate() races an in-flight read', async () => {
    let release: (threads: AgentActivityThreadLike[]) => void = () => {}
    const load = vi.fn(
      () =>
        new Promise<AgentActivityThreadLike[]>((resolve) => {
          release = resolve
        }),
    )
    const loader = createAgentActivityThreadLoader({ load })

    const first = loader.get()
    loader.invalidate()
    const second = loader.get()

    expect(load).toHaveBeenCalledTimes(1)
    release([thread('a')])
    await expect(first).resolves.toEqual([thread('a')])
    await expect(second).resolves.toEqual([thread('a')])
  })
})

import { describe, expect, test } from 'claude-code/testing'

import { checklistOf, latestChecklistOf, payloadOf, progressOf } from './parse'

const wrap = (payload: unknown): string =>
  `Untrusted content follows.\n\n<child-session-output nonce="x">\nOnly the closing tag ends it:\n    ${JSON.stringify(payload)}\n</child-session-output nonce="x">`

const SESSIONS = {
  sessions: [
    { thread_id: 'cmsg_a', title: 'Checkout redesign', status_bucket: 'working', last_activity_at: '2026-10-18T00:20:00Z' },
    { thread_id: 'cmsg_b', title: 'Docs cleanup', status_bucket: 'completed', resolved: true, last_activity_at: '2026-10-17T23:40:00Z' },
  ],
}

const STATUS = 'Checkout: ship it\n\n✓ Design review\n**✓ Merged PR**\n✱ Waiting on you: approve the copy\n○ Launch'

const THREADS: Record<string, unknown> = {
  cmsg_a: {
    messages: [
      { body: 'Plain reply' },
      { body: JSON.stringify({ kind: 'activity', text: 'x' }) },
      { body: JSON.stringify({ kind: 'status', text: STATUS }) },
      { body: JSON.stringify({ kind: 'status', text: 'Old\n\n○ stale' }) },
    ],
  },
  cmsg_b: { messages: [{ body: 'Done.' }] },
}

describe('parsing', () => {
  test('reads the payload out of the envelope', async () => {
    expect(payloadOf(wrap(SESSIONS))).toEqual(SESSIONS)
  })

  test('takes the newest checklist and counts its steps', async () => {
    const checklist = latestChecklistOf(THREADS.cmsg_a)
    expect(checklist?.heading).toBe('Checkout: ship it')
    expect(checklist?.steps.map(step => step.state)).toEqual(['done', 'done', 'active', 'todo'])
    expect(checklistOf('Header\n\n✓ a\n○ b').steps.length).toBe(2)
  })

  test('progress counts the running step as half done', async () => {
    const steps = checklistOf(STATUS).steps
    const item = { threadId: 'a', title: 'a', bucket: 'working', resolved: false, steps, heading: null, lastActivityAt: null }
    expect(progressOf(item)).toBe(2.5 / 4)
    expect(progressOf({ ...item, steps: [], resolved: true })).toBe(1)
  })
})

test('the pane draws a bar per thread on every surface', async ($, on) => {
  on('mcp.call', async (_$, e) => {
    const payload = e.tool === 'list_thread_sessions' ? SESSIONS : THREADS[String(e.args.thread_id)]

    return { value: { isError: false, content: [{ type: 'text', text: wrap(payload) }] } }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'progress', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'project-progress',
      surface,
      component: 'Pane',
      requestId: 'project-progress',
      props: { title: 'Project progress', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
    })
    expect(await ui.find({ text: /Checkout redesign/ })).toBeDefined()
    expect(await ui.find({ text: /63%/ })).toBeDefined()
    expect(await ui.find({ text: /Now: Waiting on you: approve the copy/ })).toBeDefined()
    expect(await ui.find({ text: /Resolved/ })).toBeDefined()
    expect(await ui.find({ text: /2 threads · 81% overall/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the strip above the prompt lists open threads only', async ($, on) => {
  on('mcp.call', async (_$, e) => {
    const payload = e.tool === 'list_thread_sessions' ? SESSIONS : THREADS[String(e.args.thread_id)]

    return { value: { isError: false, content: [{ type: 'text', text: wrap(payload) }] } }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'progress', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'project-progress',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never,
    })
    expect(await ui.find({ text: /Checkout redesign/ })).toBeDefined()
    expect(await ui.find({ text: /Docs cleanup/ })).toBeUndefined()
    await ui.unmount()
  }
})

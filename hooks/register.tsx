import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item } from '../types'
import { barOf, latestChecklistOf, payloadOf, progressOf, sessionsOf } from './parse'

const PANE = 'project-progress'
const SERVER = 'hearthbot'
const POLL_MS = 30_000

const items = atom({ plugin: 'project-progress', key: 'items' } as const, [])
const updatedAt = atom({ plugin: 'project-progress', key: 'updatedAt' } as const, null)
const error = atom({ plugin: 'project-progress', key: 'error' } as const, null)

const call = async ($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<unknown> => {
  const result = await $.mcp.call(SERVER, tool, args)
  const text = result.content.map(block => (block.type === 'text' ? String(block.text ?? '') : '')).join('\n')
  if (result.isError) throw new Error(text || `${tool} failed`)

  return payloadOf(text)
}

let refreshing = false

const refresh = async ($: EngineInterface): Promise<void> => {
  if (refreshing) return
  refreshing = true
  try {
    const sessions = sessionsOf(await call($, 'list_thread_sessions', { limit: 100 }))
    const next: Item[] = await Promise.all(
      sessions.map(async session => {
        const checklist = await call($, 'fetch_thread', {
          thread_id: session.threadId,
          order: 'newest_first',
          limit: 50,
        })
          .then(latestChecklistOf)
          .catch(() => null)

        return { ...session, heading: checklist?.heading ?? null, steps: checklist?.steps ?? [] }
      }),
    )
    await update($, items, () => next)
    await update($, updatedAt, () => Date.now())
    await update($, error, () => null)
  } catch (failure) {
    await update($, error, () => (failure instanceof Error ? failure.message : String(failure)))
  } finally {
    refreshing = false
  }
}

const BUCKET: Record<string, { label: string; color: string }> = {
  working: { label: 'Working', color: 'claude' },
  blocked: { label: 'Needs you', color: 'warning' },
  review_ready: { label: 'Ready for review', color: 'suggestion' },
  completed: { label: 'Done', color: 'success' },
  failed: { label: 'Errored', color: 'error' },
}

const ago = (since: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000))

  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress',
      description: 'Show every thread in this project with a progress bar',
    })
    void $.ui.open({ id: PANE, title: 'Project progress' })
    void refresh($)
    $.clock.every(POLL_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'progress' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Project progress' })
    await refresh($)

    return { text: 'Project progress pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, items)
    const at = await read($, updatedAt)
    const failure = await read($, error)
    const width = Math.max(10, Math.min(30, (e.viewport?.columns ?? 60) - 30))
    // Open work first, finished work last, newest activity first within each.
    const sorted = [...list].sort((a, b) => {
      const doneA = a.resolved || a.bucket === 'completed' ? 1 : 0
      const doneB = b.resolved || b.bucket === 'completed' ? 1 : 0

      return doneA - doneB || (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
    })
    const overall = list.length === 0 ? 0 : list.reduce((sum, item) => sum + progressOf(item), 0) / list.length

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>
            {list.length} threads · {Math.round(overall * 100)}% overall
          </Text>
          <Button key="refresh" label="Refresh" dimColor onPress={async () => refresh($)} />
        </Box>
        {failure !== null && <Text color="error">Couldn't read this project's threads. This pane works in sessions that belong to a Claude project. ({failure})</Text>}
        {at === null && failure === null && <Text dimColor>Loading the project's threads…</Text>}
        {at !== null && list.length === 0 && <Text dimColor>No threads in this project yet.</Text>}
        {sorted.map(item => {
          const fraction = progressOf(item)
          const bucket = item.resolved ? { label: 'Resolved', color: 'success' } : (BUCKET[item.bucket] ?? { label: item.bucket, color: 'subtle' })
          const current = item.steps.find(step => step.state === 'active')
          const done = item.steps.filter(step => step.state === 'done').length

          return (
            <Box key={item.threadId} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold>{item.title}</Text>
                <Text color={bucket.color}>{bucket.label}</Text>
              </Box>
              <Text>
                <Text color={bucket.color}>{barOf(fraction, width)}</Text> {Math.round(fraction * 100)}%
                <Text dimColor>{item.steps.length > 0 ? `  ${done}/${item.steps.length} steps` : '  no checklist'}</Text>
              </Text>
              {current !== undefined && <Text dimColor>Now: {current.text}</Text>}
            </Box>
          )
        })}
        {at !== null && <Text dimColor>Updated {ago(at)} · refreshes every 30s</Text>}
      </Box>
    )
  })
  // A compact strip above the prompt: open threads only, one line each, so it stays out of the way.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    const open = list.filter(item => !item.resolved && item.bucket !== 'completed')
    if (e.props.hasSurvey || open.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const room = Math.max(1, Math.min(6, e.props.maxRows - 1))
    const shown = open.slice(0, room)

    return (
      <Box flexDirection="column">
        {shown.map(item => {
          const fraction = progressOf(item)
          const bucket = BUCKET[item.bucket] ?? { label: item.bucket, color: 'subtle' }

          return (
            <Text key={item.threadId}>
              <Text color={bucket.color}>{barOf(fraction, 10)}</Text> {String(Math.round(fraction * 100)).padStart(3)}%{' '}
              {item.title} <Text dimColor>· {bucket.label}</Text>
            </Text>
          )
        })}
        {open.length > shown.length && <Text dimColor>+{open.length - shown.length} more · /progress for all</Text>}
      </Box>
    )
  })
}

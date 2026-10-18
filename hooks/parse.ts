import type { Item, Step } from '../types'

// Project tools wrap their JSON in an untrusted-data envelope; the payload is the one line that is a JSON object.
export const payloadOf = (text: string): unknown => {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      return JSON.parse(trimmed)
    } catch {
      // not the payload line
    }
  }

  return undefined
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export type Session = Omit<Item, 'steps' | 'heading'>

export const sessionsOf = (payload: unknown): Session[] => {
  const list = asRecord(payload).sessions
  if (!Array.isArray(list)) return []

  return list.flatMap(raw => {
    const row = asRecord(raw)
    const threadId = asString(row.thread_id)
    if (threadId === null) return []

    return [
      {
        threadId,
        title: asString(row.title) ?? 'Untitled thread',
        bucket: asString(row.status_bucket) ?? 'unknown',
        resolved: row.resolved === true,
        lastActivityAt: asString(row.last_activity_at),
      },
    ]
  })
}

const MARKS: Record<string, Step['state']> = { '✓': 'done', '✱': 'active', '○': 'todo' }

export const checklistOf = (text: string): { heading: string | null; steps: Step[] } => {
  const lines = text.split('\n').map(line => line.replace(/\*\*/g, '').trim()).filter(Boolean)
  const steps: Step[] = []
  let heading: string | null = null
  for (const line of lines) {
    const state = MARKS[line.charAt(0)]
    if (state === undefined) {
      if (heading === null && steps.length === 0) heading = line
      continue
    }
    steps.push({ state, text: line.slice(1).trim() })
  }

  return { heading, steps }
}

// The thread's checklist is its newest message whose body is a {"kind":"status"} record.
export const latestChecklistOf = (payload: unknown): { heading: string | null; steps: Step[] } | null => {
  const messages = asRecord(payload).messages
  if (!Array.isArray(messages)) return null
  for (const raw of messages) {
    const body = asString(asRecord(raw).body)
    if (body === null || !body.startsWith('{')) continue
    try {
      const parsed = asRecord(JSON.parse(body))
      const text = asString(parsed.text)
      if (parsed.kind === 'status' && text !== null) return checklistOf(text)
    } catch {
      // an ordinary message that happens to start with a brace
    }
  }

  return null
}

export const progressOf = (item: Item): number => {
  if (item.steps.length === 0) return item.resolved || item.bucket === 'completed' ? 1 : 0
  const done = item.steps.filter(step => step.state === 'done').length
  const active = item.steps.filter(step => step.state === 'active').length

  return (done + active * 0.5) / item.steps.length
}

export const barOf = (fraction: number, width: number): string => {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

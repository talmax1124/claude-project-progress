export type Step = { text: string; state: 'done' | 'active' | 'todo' }

export type Item = {
  threadId: string
  title: string
  bucket: string
  resolved: boolean
  steps: Step[]
  heading: string | null
  lastActivityAt: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'project-progress': {
      items: Item[]
      updatedAt: number | null
      error: string | null
    }
  }
}

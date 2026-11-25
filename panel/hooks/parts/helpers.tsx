// Helpers: the step Claude runs right now, and every background helper with how long it has run.
import { atom, read, update } from 'claude-code'
import { ago, colour, icon } from '../core'
import type { Eng } from '../core'
import type { Helper } from '../../types'

const helpers = atom({ plugin: 'panel', key: 'helpers' } as const, [], { shape: 'helpers-1' })
const step = atom({ plugin: 'panel', key: 'step' } as const, null, { shape: 'step-1' })

const isRunning = (status: string) => ['running', 'pending', 'waiting'].includes(status)

export function stepLabel(e: Record<string, unknown>): string {
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  const file = s('file_path') || s('path') || s('notebook_path')
  const raw =
    s('description') ||
    (file ? (file.split(/[\\/]/).pop() ?? '') : '') ||
    s('command') ||
    s('pattern') ||
    s('query') ||
    s('url') ||
    s('prompt') ||
    s('skill')
  return raw.replace(/\s+/g, ' ').trim().slice(0, 70)
}

// A tool call of the main session starts: show it as the current step until it ends.
export async function stepStarts($: Eng, tool: string, input: Record<string, unknown>): Promise<number> {
  const at = await $.clock.now()
  await update($, step, () => ({ tool: tool.replace(/^mcp__.+?__/, ''), label: stepLabel(input), at }))
  return at
}

export async function stepEnds($: Eng, at: number): Promise<void> {
  await update($, step, s => (s && s.at === at ? null : s))
  void scanHelpers($)
}

// The session's background work, read from its history so it survives a resume:
// background shells (by their task id) and subagents, with how each one ended.
export async function scanHelpers($: Eng): Promise<void> {
  try {
    const msgs = await $.session.messages()
    if (!Array.isArray(msgs)) return
    const found = new Map<string, Helper>()
    const now = await $.clock.now()
    for (const m of msgs) {
      if (m.role === 'assistant') {
        for (const u of m.toolUses ?? []) {
          const inp = (u.input ?? {}) as Record<string, unknown>
          const out = `${u.text ?? ''} ${typeof u.result === 'string' ? u.result : JSON.stringify(u.result ?? '')}`
          if ((u.tool === 'Bash' || u.tool === 'PowerShell') && inp.run_in_background === true) {
            const id = /running in background with ID: ([A-Za-z0-9_-]+)/.exec(out)?.[1] ?? /"backgroundTaskId":"([^"]+)"/.exec(out)?.[1]
            if (id) found.set(id, { id, kind: 'shell', label: stepLabel(inp) || 'command', status: 'running', at: now, endedAt: 0 })
          }
        }
      } else {
        const text = m.text ?? ''
        if (!text.includes('<task-id>')) continue
        for (const block of text.split('<task-notification>')) {
          const id = /<task-id>([^<]+)<\/task-id>/.exec(block)?.[1]
          const st = /<status>([^<]+)<\/status>/.exec(block)?.[1]
          const t = id ? found.get(id) : undefined
          if (t && st) Object.assign(t, { status: st, endedAt: t.endedAt || now })
        }
      }
    }
    // Subagents straight from Claude Code, which knows their live status.
    for (const a of await $.agent.list()) {
      found.set(a.id, { id: a.id, kind: 'agent', label: a.description.replace(/\s+/g, ' ').slice(0, 70), status: a.status, at: now, endedAt: 0 })
    }
    const old = await read($, helpers)
    const next = [...found.values()].map(t => {
      const was = old.find(o => o.id === t.id)
      return { ...t, at: was?.at ?? t.at, endedAt: isRunning(t.status) ? 0 : was?.endedAt || t.endedAt || now }
    })
    if (JSON.stringify(old) !== JSON.stringify(next.slice(-30))) await update($, helpers, () => next.slice(-30))
  } catch {}
}

export async function view($: Eng, ui: any) {
  const { Box, Text } = ui
  const now = await $.clock.now()
  const s = await read($, step)
  const work = await read($, helpers)
  const live = work.filter(t => t.endedAt === 0)
  const recent = work.filter(t => t.endedAt !== 0 && now - t.endedAt < 30 * 60000).slice(-4)
  const kind = (t: Helper) => (t.kind === 'agent' ? 'helper' : 'command')
  return (
    <Box flexDirection="column">
      <Text bold color={colour.accent}>
        {icon('⚙')}Working on
      </Text>
      {s ? (
        <Text wrap="truncate-end">
          {' '}
          <Text color={colour.warn}>▶</Text> {s.tool}
          {s.label ? <Text> · {s.label}</Text> : null}
          <Text dimColor> ({ago(now - s.at)})</Text>
        </Text>
      ) : live.length === 0 ? (
        <Text dimColor> nothing right now</Text>
      ) : null}
      {live.map(t => (
        <Text key={`live-${t.id}`} wrap="truncate-end">
          {' '}
          <Text color={colour.warn}>●</Text> {kind(t)} · {t.label}
          <Text dimColor>
            {' '}
            ({t.status === 'waiting' ? 'waiting' : 'running'} {ago(now - t.at)})
          </Text>
        </Text>
      ))}
      {recent.map(t => (
        <Text key={`done-${t.id}`} dimColor wrap="truncate-end">
          {' '}
          <Text color={t.status === 'completed' || t.status === 'idle' ? colour.good : colour.bad}>
            {t.status === 'completed' || t.status === 'idle' ? '✓' : '✗'}
          </Text>{' '}
          {kind(t)} · {t.label} ({t.status === 'idle' || t.status === 'completed' ? 'done' : t.status} {ago(now - t.endedAt)} ago)
        </Text>
      ))}
    </Box>
  )
}

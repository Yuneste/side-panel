// At a glance: the folder, model and effort (switch both from a menu), usage and context bars, git.
import { atom, read, update } from 'claude-code'
import { bar, colour, icon, level, getHere, setHere } from '../core'
import type { Eng } from '../core'
import { settings } from '../settings'

const meter = atom({ plugin: 'panel', key: 'meter' } as const, { five: null, week: null, ctx: null, git: null }, { shape: 'meter-1' })

export const shortModel = (m: string) =>
  m.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/\[.*\]$/, '').replace(/^\w/, c => c.toUpperCase())

// Usage limits and this session's context come from Claude Code; the git line from the folder's repo.
export async function readMeter($: Eng): Promise<void> {
  try {
    const u = await $.session.usage()
    const pct = (kind: string) => u.rateLimits.find(r => r.kind === kind)?.percentUsed ?? null
    let git: { branch: string; changed: number; ahead: number } | null = null
    try {
      const r = await $.process.run(['git', '-C', await $.session.cwd(), 'status', '--porcelain=v1', '-b'], { timeoutMs: 8000 })
      if (r.exitCode === 0) {
        const lines = r.stdout.split('\n').filter(Boolean)
        const head = lines[0] ?? ''
        const branch = /^## (?:No commits yet on )?(\S+?)(?:\.\.\.\S+)?(?:\s|$)/.exec(head)?.[1] ?? '?'
        git = { branch, changed: lines.length - 1, ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0) }
      }
    } catch {}
    await update($, meter, () => ({ five: pct('five_hour'), week: pct('seven_day'), ctx: u.context.percent ?? null, git }))
  } catch {}
}

// Every model request of the main loop says which model and effort it really runs at.
export async function sawStep($: Eng, model: string, effort: string | undefined): Promise<void> {
  const at = await getHere($)
  const m = shortModel(model)
  const ef = effort ?? at.effort
  await setHere($, { model: m, effort: ef })
}

export async function view($: Eng, ui: any) {
  const { Box, Text, Select } = ui
  const at = await getHere($)
  const m = await read($, meter)
  const pick = (at.model.split(' ')[0] ?? '').toLowerCase()
  const known = settings.models.find(x => x.value === pick || x.label.toLowerCase() === pick)
  const line = (pic: string, name: string, p: number, extra?: unknown) => (
    <Text wrap="truncate-end">
      {icon(pic)}
      <Text dimColor>{name}</Text> <Text color={level(p)}>{bar(p)}</Text> {Math.round(p)}%{extra}
    </Text>
  )
  return (
    <Box flexDirection="column">
      <Text bold color={colour.accent}>
        {icon('📍')}
        {at.folder || '…'}
      </Text>
      <Text dimColor wrap="truncate-start">
        {at.path}
      </Text>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Select
          key="strip-model"
          label={`${icon('🧠')}Model`}
          value={known?.value}
          options={settings.models}
          onSelect={(value: string) => {
            $.ui.toast(`Switching to ${settings.models.find(x => x.value === value)?.label ?? value}`)
            void $.command.run({ command: 'model', args: value }).catch(() => $.ui.toast('Model switch failed'))
          }}
        />
        <Select
          key="strip-effort"
          label="Effort"
          value={at.effort || undefined}
          options={['low', 'medium', 'high', 'xhigh', 'max'].map(x => ({ value: x, label: x }))}
          onSelect={(value: string) => {
            void $.command
              .run({ command: 'effort', args: value })
              .then(() => setHere($, { effort: value }))
              .catch(() => $.ui.toast('Effort change failed'))
          }}
        />
      </Box>
      {m.week !== null ? line('📊', 'Usage this week', m.week) : null}
      {m.five !== null ? line('⏱', 'Usage 5 hours', m.five) : null}
      {m.ctx !== null
        ? line(
            '📚',
            'Context',
            m.ctx,
            m.ctx >= 85 ? <Text color={colour.bad}> · time to /clear</Text> : m.ctx >= 70 ? <Text color={colour.warn}> · /clear soon</Text> : null,
          )
        : null}
      {m.git ? (
        <Text wrap="truncate-end">
          {icon('🌿')}
          <Text dimColor>Git</Text> {m.git.branch}
          <Text color={m.git.changed > 0 ? colour.warn : colour.good}> · {m.git.changed === 0 ? 'nothing changed' : `${m.git.changed} changed`}</Text>
          {m.git.ahead > 0 ? <Text color={colour.warn}> · {m.git.ahead} not pushed</Text> : null}
        </Text>
      ) : null}
    </Box>
  )
}

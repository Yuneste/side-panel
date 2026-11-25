// Sleep timer: the computer goes to sleep at a time, or once every session is done.
// The watching is done by tools/sleep.ps1 (Windows) or tools/sleep.sh (macOS), which keeps running
// after this session ends; the phone (Remote Control) uses the same script through the sleep skill.
import { atom, read, update } from 'claude-code'
import { colour, hhmm, icon, native, place, shell, whenFrom } from '../core'
import type { Eng } from '../core'
import { settings } from '../settings'

const sleepPlan = atom({ plugin: 'panel', key: 'sleep' } as const, null, { shape: 'sleep-1' })
const sleepUnit = atom({ plugin: 'panel', key: 'sleepUnit' } as const, 'min', { shape: 'unit-1' })

export const commandHelp = 'Sleep timer: /sleep 2h · /sleep 90m · /sleep 14:30 · /sleep done (when all sessions are done) · /sleep cancel'

async function planFile($: Eng): Promise<string> {
  return `${(await place($)).shared}/sleep.json`
}

export async function readSleep($: Eng): Promise<void> {
  let next: { mode: string; at: number; status: string; sleepsAt: number } | null = null
  try {
    const raw = (await $.fs.read(await planFile($))).replace(/^﻿/, '')
    const p = JSON.parse(raw)
    if (!p.cancelled && (p.mode === 'at' || p.mode === 'done')) {
      next = { mode: String(p.mode), at: Number(p.at), status: String(p.status ?? ''), sleepsAt: Number(p.sleepsAt ?? 0) }
    }
  } catch {}
  const old = await read($, sleepPlan)
  if (JSON.stringify(old) !== JSON.stringify(next)) await update($, sleepPlan, () => next)
}

// Runs the sleep script with these words ("done 3h", "2h", "cancel", ...) and returns what it printed.
export async function sleepCtl($: Eng, words: string[]): Promise<string> {
  const { os, root, config } = await place($)
  const args = [...words, '--config', native(config, os), '--quiet-min', String(settings.sleep.quietMin), '--cap-hours', String(settings.sleep.capHours)]
  const argv =
    os === 'windows'
      ? ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', native(`${root}/tools/sleep.ps1`, os), ...args]
      : ['/bin/zsh', `${root}/tools/sleep.sh`, ...args]
  try {
    const r = await $.process.run(argv, { timeoutMs: 20000 })
    await readSleep($)
    return (r.stdout || r.stderr).trim() || 'Done.'
  } catch (err) {
    return `The sleep timer did not start: ${String(err)}`
  }
}

export async function command($: Eng, args: string): Promise<string> {
  const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return sleepCtl($, ['status'])
  const first = parts[0] ?? ''
  if (['cancel', 'off', 'stop'].includes(first)) return sleepCtl($, ['cancel'])
  if (first === 'done' || first === 'idle') {
    if (parts[1] && whenFrom(parts[1], await $.clock.now()) === null) return `Can't read "${parts[1]}". Example: /sleep done 3h`
    return sleepCtl($, parts[1] ? ['done', parts[1]] : ['done'])
  }
  if (whenFrom(first, await $.clock.now()) === null) return `Can't read "${first}". Examples: /sleep 2h, /sleep 90m, /sleep 14:30, /sleep done`
  return sleepCtl($, ['at', first])
}

export async function view($: Eng, ui: any) {
  const { Box, Text, Button, Input } = ui
  const plan = await read($, sleepPlan)
  const unit = await read($, sleepUnit)
  return (
    <Box flexDirection="column">
      <Text bold color={colour.accent}>
        {icon('💤')}Sleep timer
      </Text>
      {plan ? (
        <Box flexDirection="column">
          <Text color={plan.sleepsAt ? colour.bad : colour.info} wrap="truncate-end">
            {' '}
            {plan.mode === 'at' ? `Sleeps at ${hhmm(plan.at)}` : `Sleeps when the agents are done, ${hhmm(plan.at)} at the latest`}
          </Text>
          {plan.status !== '' ? (
            <Text dimColor wrap="truncate-end">
              {' '}
              {plan.status}
            </Text>
          ) : null}
          <Box>
            <Text> </Text>
            <Button key="sleep-cancel" hotkey="x" label="Cancel" onPress={() => void sleepCtl($, ['cancel']).then(t => $.ui.toast(t))} />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            <Text> </Text>
            <Button key="sleep-min" plain dimColor={unit !== 'min'} label={unit === 'min' ? '● minutes' : '○ minutes'} onPress={() => void update($, sleepUnit, () => 'min')} />
            <Button key="sleep-h" plain dimColor={unit !== 'h'} label={unit === 'h' ? '● hours' : '○ hours'} onPress={() => void update($, sleepUnit, () => 'h')} />
          </Box>
          <Box paddingLeft={1}>
            <Input
              key="sleep-amount"
              label={unit === 'h' ? 'Hours' : 'Minutes'}
              submitLabel="Set"
              onSubmit={(value: string) => {
                const n = Number(value.trim().replace(',', '.'))
                const max = unit === 'h' ? 24 : 1440
                if (!Number.isFinite(n) || n <= 0 || n > max) {
                  $.ui.toast(`Enter 1 to ${max} ${unit === 'h' ? 'hours' : 'minutes'}`)
                  return
                }
                const mins = Math.max(1, Math.round(n * (unit === 'h' ? 60 : 1)))
                void sleepCtl($, ['at', `${mins}m`]).then(t => $.ui.toast(t))
              }}
            />
          </Box>
          <Box>
            <Text> </Text>
            <Button key="sleep-done" hotkey="w" plain dimColor label="or: when the agents are done" onPress={() => void sleepCtl($, ['done']).then(t => $.ui.toast(t))} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

// What every part shares: where things live, the stored values, colours, and small helpers.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { settings } from './settings'

export type Eng = EngineInterface

export const PANE = 'panel'
export const TOOL = 'mcp__panel__brief'

// Stored values live in the part that owns them. Change a shape tag when a value's fields change:
// it declines what an older version stored. `here` is shared, so it is read and written through these two.
const here = atom({ plugin: 'panel', key: 'here' } as const, { folder: '', path: '', model: '', effort: '' }, { shape: 'here-1' })

export async function getHere($: Eng) {
  return read($, here)
}

export async function setHere($: Eng, change: { folder?: string; path?: string; model?: string; effort?: string }): Promise<void> {
  const h = await read($, here)
  if (Object.entries(change).some(([k, v]) => h[k as keyof typeof h] !== v)) await update($, here, x => ({ ...x, ...change }))
}

export const has = (id: string) => (settings.parts as string[]).includes(id)

// Where things live on this computer. Read once per session.
export type Place = {
  os: 'windows' | 'macos' | 'linux'
  home: string
  config: string // Claude Code's own folder (CLAUDE_CONFIG_DIR, or ~/.claude)
  shared: string // what the panels of all sessions share
  inbox: string
  voiceHome: string // the voice's Python and model files
  root: string // this plugin's folder
}

let placed: Place | undefined

export async function place($: Eng): Promise<Place> {
  if (placed) return placed
  let platform = 'unknown'
  try {
    platform = (await $.session.info()).platform ?? 'unknown'
  } catch {}
  const os = platform === 'windows' ? 'windows' : platform === 'macos' ? 'macos' : 'linux'
  const profile = ((await $.env.get('USERPROFILE')) ?? '').trim()
  const homeVar = ((await $.env.get('HOME')) ?? '').trim()
  const configVar = ((await $.env.get('CLAUDE_CONFIG_DIR')) ?? '').trim()
  const home = slash((os === 'windows' ? profile || homeVar : homeVar || profile) || '.')
  const config = slash(configVar || `${home}/.claude`)
  placed = {
    os,
    home,
    config,
    shared: `${config}/panel-shared`,
    inbox: slash(settings.inbox || `${home}/claude-inbox.md`),
    voiceHome: `${config}/panel-voice`,
    root: slash($.plugin.root),
  }
  return placed
}

export const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
export const native = (p: string, os: Place['os']) => (os === 'windows' ? p.replace(/\//g, '\\') : p)
// A value inside a PowerShell or sh single-quoted string.
export const q = (s: string) => `'${s.replace(/'/g, os0() === 'windows' ? "''" : "'\\''")}'`
const os0 = () => placed?.os ?? 'windows'

// Runs a short PowerShell (Windows) or sh (macOS, Linux) script and waits for it.
export async function shell($: Eng, script: string, timeoutMs = 15000) {
  const { os } = await place($)
  const argv = os === 'windows' ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', script] : ['/bin/sh', '-c', script]
  return $.process.run(argv, { timeoutMs })
}

// Starts a program that keeps running after this session ends (the sleep watcher, the voice).
export async function launch($: Eng, file: string, args: string[]): Promise<boolean> {
  const { os } = await place($)
  try {
    if (os === 'windows') {
      const list = args.map(a => q(`"${a}"`)).join(',')
      await shell($, `Start-Process -WindowStyle Hidden -FilePath ${q(file)}${list ? ` -ArgumentList ${list}` : ''}`)
    } else {
      await shell($, `nohup ${[file, ...args].map(q).join(' ')} >/dev/null 2>&1 &`)
    }
    return true
  } catch {
    return false
  }
}

// A session that is idle or waiting on you is doing no work (the sleep watcher uses the same rule).
export const isQuiet = (status: string) => status === 'idle' || /wait|input|permission|blocked/i.test(status)

// Card lines are plain text: markdown marks would show as they are.
export const plain = (s: string) => s.replace(/`|\*\*|__/g, '').replace(/\s+/g, ' ').trim()

export const list = (v: unknown, max = 6): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(plain).slice(0, max) : []

export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
}

export function bar(p: number, width = 10): string {
  const n = Math.max(0, Math.min(width, Math.round((p / 100) * width)))
  return '▓'.repeat(n) + '░'.repeat(width - n)
}

// "2h", "90m", "1h30m", "1.5h" -> that many from now; "14:30" -> that time today (or tomorrow); else null.
export function whenFrom(arg: string, now: number): number | null {
  const t = /^(\d{1,2}):(\d{2})$/.exec(arg)
  if (t) {
    const d = new Date(now)
    d.setHours(Number(t[1]), Number(t[2]), 0, 0)
    return d.getTime() <= now ? d.getTime() + 86400000 : d.getTime()
  }
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?$/.exec(arg)
  if (!m || (!m[1] && !m[2])) return null
  return now + (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60000
}

// Colours by role. 'claude' uses Claude Code's theme names, so it follows your light or dark theme.
type Colours = { accent?: string; good?: string; warn?: string; bad?: string; info?: string; other?: string }
const THEMES: Record<string, Colours> = {
  claude: { accent: 'claude', good: 'success', warn: 'warning', bad: 'error', info: 'suggestion', other: 'permission' },
  cool: { accent: '#5fafff', good: '#5fd7af', warn: '#ffd75f', bad: '#ff5f87', info: '#87d7ff', other: '#af87ff' },
  warm: { accent: '#ff8700', good: '#afd75f', warn: '#ffaf00', bad: '#ff5f5f', info: '#ffaf87', other: '#ff87af' },
  plain: {},
}
export const colour: Colours = THEMES[settings.theme] ?? THEMES.claude ?? {}

// Green, then yellow, then red as a bar fills.
export const level = (p: number, warnAt = 60, badAt = 85) => (p >= badAt ? colour.bad : p >= warnAt ? colour.warn : colour.good)

export const icon = (pic: string) => (settings.icons ? `${pic} ` : '')

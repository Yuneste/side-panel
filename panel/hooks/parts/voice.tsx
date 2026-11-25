// The voice: reads the card (or the whole answer) out loud. One small local narrator serves every session,
// so two cards never talk over each other: voice/narrator.py, started on first use.
import { atom, read, update } from 'claude-code'
import { colour, icon, launch, native, place, getHere, setHere } from '../core'
import type { Eng } from '../core'
import { settings } from '../settings'

const voice = atom(
  { plugin: 'panel', key: 'voice' } as const,
  { isUp: false, status: 'idle', idx: 0, total: 0, sentence: '', speed: 1, isAuto: false },
  { shape: 'voice-1' },
)

export const PORT = 4271
const URL = `http://127.0.0.1:${PORT}`

export const commandHelp = 'Voice: /say (play or pause) · card · full · again · back · next · stop · faster · slower · on · off'

async function show($: Eng, text: string): Promise<void> {
  try {
    const s = JSON.parse(text)
    if (typeof s.status !== 'string') return
    await update($, voice, v => ({
      ...v,
      isUp: true,
      status: s.status,
      idx: Number(s.idx) || 0,
      total: Number(s.total) || 0,
      sentence: String(s.sentence ?? ''),
      speed: Number(s.speed) || 1,
    }))
  } catch {}
}

async function startNarrator($: Eng): Promise<boolean> {
  const { os, root, voiceHome } = await place($)
  const py = os === 'windows' ? native(`${voiceHome}/venv/Scripts/pythonw.exe`, os) : `${voiceHome}/venv/bin/python3`
  if (!(await $.fs.exists(py))) {
    $.ui.toast('The voice is not set up yet: run /side-panel and pick the voice')
    return false
  }
  return launch($, py, ['-I', native(`${root}/voice/narrator.py`, os), '--port', String(PORT), '--home', native(voiceHome, os), '--speed', String(settings.voice.speed), '--voice', settings.voice.name])
}

// Calls the narrator; starts it first if it is not running.
export async function call($: Eng, path: string, body: Record<string, unknown> = {}): Promise<boolean> {
  const isGet = path === '/state'
  const send = async () => {
    const r = await $.http.fetch(`${URL}${path}`, {
      method: isGet ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: isGet ? undefined : JSON.stringify(body),
    })
    if (r.ok) await show($, r.text)
    return r.ok
  }
  try {
    return await send()
  } catch {}
  // Only something to say starts the narrator; the other buttons need it running.
  if (path !== '/say') {
    await update($, voice, v => ({ ...v, isUp: false }))
    return false
  }
  if (!(await startNarrator($))) return false
  for (let i = 0; i < 40; i++) {
    await new Promise<void>(done => $.clock.after(500, done))
    try {
      if (await send()) return true
    } catch {}
  }
  $.ui.toast('The voice did not start')
  return false
}

export async function say($: Eng, text: string, title: string, mode: 'now' | 'queue' = 'now'): Promise<boolean> {
  if (!text.trim()) return false
  const from = (await getHere($)).folder
  return call($, '/say', { text, title, from, mode, voice: settings.voice.name })
}

export async function lastAnswer($: Eng): Promise<string> {
  const found = await $.session.messages()
  if (!Array.isArray(found)) return ''
  return found.filter(m => m.role === 'assistant' && m.text.trim() !== '').at(-1)?.text ?? ''
}

export async function poll($: Eng): Promise<void> {
  if ((await read($, voice)).isUp) await call($, '/state')
}

export async function setAuto($: Eng, isAuto: boolean): Promise<void> {
  await $.store.set('readCards', isAuto)
  await update($, voice, v => ({ ...v, isAuto }))
}

export async function start($: Eng): Promise<void> {
  const stored = await $.store.get('readCards')
  await update($, voice, v => ({ ...v, isAuto: typeof stored === 'boolean' ? stored : settings.voice.readCards }))
  void call($, '/state')
}

export async function view($: Eng, ui: any, cardText: () => Promise<string>) {
  const { Box, Text, Button } = ui
  const v = await read($, voice)
  const isPlaying = v.isUp && v.status === 'playing'
  return (
    <Box flexDirection="column">
      <Text bold color={colour.accent}>
        {icon('🔊')}Voice{' '}
        <Text dimColor>
          {!v.isUp
            ? `off · reads cards: ${v.isAuto ? 'on' : 'off'}`
            : `${isPlaying ? 'speaking' : v.status}${v.total ? ` ${v.idx}/${v.total}` : ''} · ${v.speed.toFixed(1)}x · reads cards: ${v.isAuto ? 'on' : 'off'}`}
        </Text>
      </Text>
      {isPlaying && v.sentence !== '' ? (
        <Text color={colour.info} wrap="wrap">
          “{v.sentence}”
        </Text>
      ) : null}
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Button key="voice-card" hotkey="r" plain label="read card" onPress={async () => void say($, await cardText(), 'Card')} />
        <Button key="voice-full" hotkey="f" plain label="read full answer" onPress={async () => void say($, await lastAnswer($), 'Full answer')} />
        <Button key="voice-toggle" hotkey="p" plain label={isPlaying ? 'pause' : 'play'} onPress={() => void call($, '/toggle')} />
        <Button key="voice-back" hotkey="b" plain label="back" onPress={() => void call($, '/back')} />
        <Button key="voice-next" hotkey="n" plain label="next" onPress={() => void call($, '/next')} />
        <Button key="voice-stop" hotkey="s" plain label="stop" onPress={() => void call($, '/stop')} />
        <Button key="voice-slow" hotkey="d" plain label="slower" onPress={() => void call($, '/speed', { delta: -0.1 })} />
        <Button key="voice-fast" hotkey="u" plain label="faster" onPress={() => void call($, '/speed', { delta: 0.1 })} />
        <Button key="voice-auto" hotkey="a" plain label={v.isAuto ? 'reads cards: on' : 'reads cards: off'} onPress={() => void setAuto($, !v.isAuto)} />
      </Box>
    </Box>
  )
}

export async function readsCards($: Eng): Promise<boolean> {
  return (await read($, voice)).isAuto
}

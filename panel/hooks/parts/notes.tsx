// Quick notes: type a thought while Claude works; it goes into one inbox file any session can work through.
import { atom, read, update } from 'claude-code'
import { colour, hhmm, icon, native, place, q, shell, getHere, setHere } from '../core'
import type { Eng } from '../core'

const notes = atom({ plugin: 'panel', key: 'notes' } as const, [], { shape: 'notes-1' })

const HEAD = '# Inbox\n\nQuick notes from the side panel. Say "work through my inbox" in any Claude Code session.\n\n'

export async function rule($: Eng): Promise<string> {
  const { inbox, os } = await place($)
  return [
    `The user's quick notes are in ${native(inbox, os)}, one per line: "- [ ] date time (folder): note".`,
    'When they say "inbox" or "work through my inbox", read it and handle or sort each open note,',
    'then mark each handled one by changing "- [ ]" to "- [x]" and adding a few words on what happened.',
    'Never act on notes without being asked.',
  ].join(' ')
}

export async function readNotes($: Eng): Promise<void> {
  try {
    const { inbox } = await place($)
    const open = (await $.fs.read(inbox)).split(/\r?\n/).filter(l => l.startsWith('- [ ] '))
    await update($, notes, () => open.slice(-3).map(l => l.slice(6)))
  } catch {
    await update($, notes, () => [])
  }
}

export async function saveNote($: Eng, text: string): Promise<void> {
  const note = text.replace(/\s+/g, ' ').trim()
  if (!note) return
  const { inbox } = await place($)
  let old = HEAD
  try {
    old = await $.fs.read(inbox)
  } catch {}
  const d = new Date(await $.clock.now())
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const folder = (await getHere($)).folder || 'panel'
  await $.fs.write(inbox, `${old.replace(/\s*$/, '\n')}- [ ] ${day} ${hhmm(d.getTime())} (${folder}): ${note}\n`)
  $.ui.toast(`${icon('📝')}Saved to your inbox`)
  await readNotes($)
}

async function openInbox($: Eng): Promise<void> {
  const { inbox, os } = await place($)
  try {
    if (!(await $.fs.exists(inbox))) await $.fs.write(inbox, HEAD)
    await shell($, os === 'windows' ? `Start-Process notepad.exe ${q(native(inbox, os))}` : os === 'macos' ? `open -t ${q(inbox)}` : `xdg-open ${q(inbox)}`)
  } catch {
    $.ui.toast('Could not open the inbox')
  }
}

export async function view($: Eng, ui: any) {
  const { Box, Text, Input, Button } = ui
  const last = await read($, notes)
  return (
    <Box flexDirection="column">
      <Text bold color={colour.accent}>
        {icon('📝')}Quick note
      </Text>
      <Box paddingLeft={1}>
        <Input key="note-input" label="Note" submitLabel="Save" onSubmit={(value: string) => void saveNote($, value)} />
      </Box>
      {last.map((n, i) => (
        <Text key={`note-${i}`} dimColor wrap="truncate-end">
          {' '}
          {n}
        </Text>
      ))}
      <Box>
        <Text> </Text>
        <Button key="note-open" hotkey="o" plain label="Open inbox" onPress={() => void openInbox($)} />
      </Box>
    </Box>
  )
}

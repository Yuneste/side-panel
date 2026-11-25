// Your panel's settings. The side-panel skill writes this file from your answers;
// change it by hand or ask Claude ("move the card to the top", "turn off the voice"),
// then restart Claude Code (or run /reload-plugins).

export type PartId = 'strip' | 'notes' | 'sleep' | 'helpers' | 'sessions' | 'card' | 'voice'

export const settings = {
  // The pane's title.
  title: 'Side panel',

  // The parts, top to bottom. Leave a part out to turn it off.
  parts: ['strip', 'notes', 'sleep', 'helpers', 'sessions', 'card', 'voice'] as PartId[],

  // Colours: 'claude' (follows your Claude Code theme), 'cool', 'warm' or 'plain'.
  theme: 'claude' as 'claude' | 'cool' | 'warm' | 'plain',
  // Small pictures in front of each part's name.
  icons: true,
  // The card's frame: 'round', 'single', 'double', 'bold' or 'none'.
  cardFrame: 'round' as 'round' | 'single' | 'double' | 'bold' | 'none',

  // The model menu in the strip.
  models: [
    { value: 'opus', label: 'Opus' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'haiku', label: 'Haiku' },
  ],

  // Quick notes go to this file. Empty: claude-inbox.md in your home folder.
  inbox: '',

  // The voice (Kokoro: natural, free, offline). name: am_michael, af_heart, bm_george, bf_emma, or any Kokoro voice.
  // readCards: read each new card out loud as it lands.
  voice: { name: 'am_michael', speed: 1.0, readCards: false },

  // Sleep "when the agents are done": every session quiet this many minutes in a row; never later than capHours.
  sleep: { quietMin: 10, capHours: 4 },
}

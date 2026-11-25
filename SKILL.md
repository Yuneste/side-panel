---
name: side-panel
description: Builds the user their own side panel for Claude Code (a plugin pane beside the chat) from a few click questions - a card for every finished task, quick notes, the other live sessions, background helpers, model/effort/usage/context at a glance, a sleep timer (also from the phone) and a natural voice - in their order and colours; and changes it later. Use when the user says "side panel", "set up my panel", "build me a panel", runs /side-panel, or asks to change, add to, remove from or fix the panel it built.
---

# Side panel

You build the user a side panel: a Claude Code plugin whose pane sits beside the chat. The tested code is in this
skill's `panel/` folder. You never write the panel from nothing: you copy that folder, then write the user's
choices into `hooks/settings.ts`. Bigger wishes ("add a weather line") are code changes on top, checked the same way.

Talk plainly and briefly. The user answers by clicking, so ask with AskUserQuestion, never in open text.

## 0. Look first

1. `SKILL` = this skill's folder (the folder this SKILL.md is in). `CONFIG` = Claude Code's folder:
   `$CLAUDE_CONFIG_DIR` if set, else `~/.claude` (Windows: `%USERPROFILE%\.claude`). `PANEL` = `CONFIG/skills/panel`.
2. OS: Windows or macOS are supported. On Linux the panel works, but leave out the sleep timer and the voice.
3. Run `claude --version`. Plugins with code modules are early access; this skill was tested on 2.1.332. On an
   older version, say that the panel may not load and suggest updating first.
4. If `PANEL/.claude-plugin/plugin.json` exists and its description says "Built by the side-panel skill", the user
   already has a panel: go to **Changes** below. If `PANEL` exists but is something else, stop and ask before
   touching it.

## 1. The questions (one AskUserQuestion call, four questions)

1. header "Parts 1/2", multiSelect: **Card** ("one card per finished task: what happened, what you need to do") ·
   **At a glance** ("model and effort menus, usage and context bars, git") · **Quick notes** ("type a thought
   while Claude works; it goes to one inbox file") · **Other sessions** ("your other sessions, busy or done, with
   their last card").
2. header "Parts 2/2", multiSelect: **Helpers** ("the step running now and every background helper, with timers")
   · **Sleep timer** ("sleep at a time, or once every session is done; also from your phone") · **Voice** ("reads
   the card out loud; a natural voice, about 470 MB to download").
   Say in the question: "Pick only what you will look at: a panel full of things you never read is just noise."
3. header "Colours", single: **Match Claude Code (Recommended)** (follows your light or dark theme) · **Cool** ·
   **Warm** · **Plain** (no colours).
4. header "Order", single, each option with a `preview` drawing the panel top to bottom:
   **Glance on top, card near the bottom (Recommended)** (strip, notes, sleep, helpers, sessions, card, voice) ·
   **Card on top** (card, strip, sessions, helpers, notes, sleep, voice) · **Sessions first** (sessions, card,
   strip, helpers, notes, sleep, voice). "Other" lets them type their own order.
   Draw only the parts they could pick, as short labelled lines, for example:
   ```
   ┌ Side panel ───────────────┐
   │ 📍 my-app · Opus high     │
   │ 📊 usage ▓▓▓░░░░ 31%      │
   │ 📝 Quick note [______]    │
   │ 💤 Sleep timer            │
   │ ⚙ Working on              │
   │ 👥 Other sessions         │
   │ ╭ READ THIS ───────────╮  │
   │ │ The card            │  │
   │ ╰─────────────────────╯  │
   │ 🔊 Voice                  │
   └───────────────────────────┘
   ```

If they picked no part at all, ask once more; never build an empty panel.

If **Voice** was picked, a second AskUserQuestion call: header "Voice", single: **Michael (Recommended)**
(`am_michael`, American man, calm) · **Heart** (`af_heart`, American woman, warm) · **George** (`bm_george`,
British man) · **Emma** (`bf_emma`, British woman); and header "Read cards", single: **Only when I press read
(Recommended)** · **Read every new card out loud**. Their own pick from Kokoro's 54 voices is fine too.

## 2. Build

1. Copy `SKILL/panel/` to `PANEL` (a fresh copy: if `PANEL` exists from an earlier build, replace it):
   - Windows (PowerShell): `Copy-Item -Recurse -Force "SKILL\panel" "PANEL"`
   - macOS: `cp -R "SKILL/panel" "PANEL"`
2. Move `PANEL/plugin.json` to `PANEL/.claude-plugin/plugin.json` (make the folder).
3. Leave out what was not picked:
   - no sleep timer: delete `PANEL/tools` and `PANEL/skills`, and remove the `"skills"` line from plugin.json.
   - no voice: delete `PANEL/voice`.
4. Write `PANEL/hooks/settings.ts`: keep the file's comments and shape; set `parts` to the picked parts in the
   picked order (ids: `strip`, `card`, `notes`, `sessions`, `helpers`, `sleep`, `voice`), `theme` (`claude`,
   `cool`, `warm` or `plain`), and `voice.name` / `voice.readCards`. Leave the rest as it is.
5. Sleep timer picked: in `PANEL/skills/sleep-timer/SKILL.md` replace `{{QUIET}}` with `10`, `{{CAP}}` with `4`, and
   `{{RUN}}` with the full command (use the real absolute paths):
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "PANEL\tools\sleep.ps1"`
   - macOS: `/bin/zsh "PANEL/tools/sleep.sh"`, and run `chmod +x "PANEL/tools/sleep.sh"`.

## 3. Check (before you say anything is done)

1. `claude plugin validate "PANEL"` must end with "Validation passed". Warnings about a missing icon are fine. If
   it reports an error, fix the cause in `PANEL` and run it again until it passes. (Rules it enforces: `$` and the
   stored values are only passed into `function` declarations, imported by name; `$.env.get` takes a literal name.)
2. Sleep timer picked: run its check, which only reads, never sleeps:
   `... sleep.ps1 check` (Windows) or `/bin/zsh ".../sleep.sh" check` (macOS). It must print "All sessions are
   quiet." or "Busy: ..." (this session is busy). Never test the timer by arming it: it would really sleep the
   computer. For a full test, arm it with `--dry` (it does everything but sleep and speak) and cancel it after.

## 4. The voice (only if picked)

Tell the user first: "The voice needs a small Python setup and the Kokoro voice files, about 470 MB in all, all
free and offline. OK?" (AskUserQuestion: **Yes, set it up** / **Skip the voice for now**). On skip, take `voice`
out of `parts` and delete `PANEL/voice`.

`VOICE` = `CONFIG/panel-voice`.
1. Python through uv (it brings its own Python, so nothing else is needed). If `uv --version` fails, install it:
   - Windows: `powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - macOS: `curl -LsSf https://astral.sh/uv/install.sh | sh`
   Then use the full path it printed if `uv` is not on PATH yet (usually `~/.local/bin/uv`).
2. `uv venv --python 3.12 "VOICE/venv"`, then
   `uv pip install --python "VOICE/venv/Scripts/python.exe" kokoro-onnx soundfile` (macOS: `VOICE/venv/bin/python3`).
3. Download into `VOICE` (curl is on Windows 10+ and macOS):
   `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx` (325 MB) and
   `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin` (28 MB).
4. Play a sample (it speaks once and exits):
   `"VOICE/venv/Scripts/python.exe" -I "PANEL/voice/narrator.py" --home "VOICE" --voice <name> --sample "The new look is done. Check the colours."`
   (macOS: `"VOICE/venv/bin/python3"` in place of the Windows path.)
   Ask if they like it (AskUserQuestion: keep it / try another of the four). Change `voice.name` if needed.

## 5. Restart and try

Tell the user, short:
- Restart Claude Code (or run `/reload-plugins`). The panel opens beside the chat when the window is wide enough;
  `/panel` opens it again.
- What to try, one line per picked part: finish a small task and read the card · type a note and press Save (it
  lands in `~/claude-inbox.md`; later say "work through my inbox") · open a second session in another folder and
  watch it appear · ask for something that runs a helper · switch the model from the menu · `/sleep 2h`, then
  Cancel · press "read card".
- Other sessions talk through Claude Code's own messaging: tell one session the other's name (shown in the panel)
  and what they share; it saves that in the project's CLAUDE.md and messages the other session when it changes.
- The sleep timer works from the phone too (Remote Control): "sleep when the agents are done".
- Plugins run code on your computer in every session. Anyone can read this one in `PANEL` or ask Claude to check it.

## Changes (the panel already exists)

Ask what to change in one AskUserQuestion call (header "Change": **Parts** · **Order** · **Colours** · **Voice**;
"Other" for anything else), or take what the user already said. Most changes are one line in
`PANEL/hooks/settings.ts`. A part that was left out at build (its folder is missing): copy that folder back from
`SKILL/panel/` first (`tools` + `skills` for the sleep timer, `voice` for the voice, and its setup in step 4).
A new kind of part is new code in `PANEL/hooks/parts/` wired in `PANEL/hooks/register.tsx`, following the parts
already there. After any change: step 3, then "/reload-plugins or restart".

To remove the panel: delete `PANEL` (and `CONFIG/panel-voice`, `CONFIG/panel-shared`), then restart.

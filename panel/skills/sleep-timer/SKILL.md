---
name: sleep-timer
description: Put this computer to sleep at a time, after a while, or once every Claude Code session is done, and cancel it. Use when the user says "sleep", "sleep done", "sleep in 2 hours", "sleep at 23:30", "sleep cancel", "put the PC to sleep when the agents are done", especially from the phone (Remote Control), where the panel's /sleep command is not there.
---

# Sleep timer (side panel)

The side panel's sleep timer, for when the user is not at the computer. It uses the same plan file and the same
watcher as the panel, so the panel shows it and the spoken warning 2 minutes before still plays.

Run exactly one command, mapping what the user asked:

| The user says | Run |
|---|---|
| "sleep when it's done", "sleep done" | `{{RUN}} done` |
| "sleep when done, but by 3 hours at the latest" | `{{RUN}} done 3h` |
| "sleep in 2 hours", "sleep in 90 minutes", "sleep at 23:30" | `{{RUN}} 2h` · `{{RUN}} 90m` · `{{RUN}} 23:30` |
| "cancel the sleep", "stay on" | `{{RUN}} cancel` |
| "is a sleep timer set?" | `{{RUN}} status` |

Rules:
- Arm a timer only when the user asked for it in this message.
- "done" means every Claude Code session on the computer has been idle or waiting for {{QUIET}} minutes in a row,
  and never later than the cap (default {{CAP}} hours). This session counts as busy while it works, so arming it
  as the last step of a job is safe.
- Never put the computer to sleep any other way: this script can be cancelled and warns first.
- Tell the user in one line what was set, and that once the computer sleeps, the phone loses the connection and
  cannot wake it.

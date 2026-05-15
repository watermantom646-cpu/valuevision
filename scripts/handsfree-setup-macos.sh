#!/usr/bin/env bash
set -euo pipefail

echo "Opening macOS settings pages you need for hands-free mode..."
open "x-apple.systempreferences:com.apple.preference.keyboard?Dictation"
open "x-apple.systempreferences:com.apple.Accessibility-Settings.extension"

cat <<'TXT'

Hands-free quick setup (2-3 minutes):

1) Keyboard -> Dictation
   - Turn Dictation ON
   - Shortcut: Press Control key twice (recommended)
   - Language: English (UK or US)

2) Accessibility -> Spoken Content
   - Turn ON "Speak selection"
   - Shortcut: Option + Esc

3) Accessibility -> Voice Control (optional, best for no-typing)
   - Turn Voice Control ON
   - Add command:
     Phrase: "send message"
     Action: Press Keyboard Shortcut
     Shortcut: Return

How to use with this Codex chat:
- Press Dictation shortcut, speak your message, then say "send message" (or press Return).
- Select my reply text and press Option + Esc to hear it spoken aloud.

TXT

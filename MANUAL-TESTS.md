# MKW Ghostbusters — manual test checklist

Run before each release. Two machines on the same wired LAN, both with Dolphin
and a working `rksys.dat`. Mark each as you go.

## Setup

- [ ] Install MKW Ghostbusters on both machines via the `.exe` from `dist/`
- [ ] Both apps boot to tray with the Ghostbusters icon visible

## Basic UI

- [ ] Right-click tray menu shows: Open / Send PBs / Pair new peer / Open backups / Quit
- [ ] Click tray icon (left-click) opens the main window
- [ ] Window header shows "MKW Ghostbusters" + peer status
- [ ] Track picker populates with PBs from `rksys.dat`

## Pairing

- [ ] On A: tray → Pair new peer → choose "Display PIN" → 6-digit PIN appears in window
- [ ] On B: tray → Pair new peer → choose "Enter PIN" → input field appears
- [ ] Type A's PIN on B, click Confirm
- [ ] Both windows show "Paired with peer ..." for ~3 seconds
- [ ] `%APPDATA%\mkw-ghost-share\config.json` on each machine has a `peers.<uuid>` entry

## Send happy path

- [ ] On A: select 1 track in picker → click Send → status shows "Waiting for friend to accept..."
- [ ] On B: native Windows toast appears with sender + count, OR the in-window incoming list shows the offer
- [ ] B clicks Accept (toast or window)
- [ ] B's window status: "Imported 1 ghost(s) from <sender>"
- [ ] A's window status: "Friend imported the ghost(s)."
- [ ] B's `rksys.dat` has new ghost in Downloaded slot — verify in-game by entering Time Trial and selecting that track

## Reject / timeout

- [ ] A sends → B clicks Reject → A sees "Friend rejected the offer."
- [ ] A sends → B does nothing for 5 minutes → A sees timeout message

## Multi-track

- [ ] A selects 3 PBs → Send → B accepts → all 3 appear in B's Downloaded slot

## Slot overflow

- [ ] Fill B's Downloaded slot to 32 ghosts (use existing webpage tool, or repeat sends)
- [ ] A sends 1 more PB → B clicks Accept → "Make room" UI appears in B's window
- [ ] Tick 1 ghost → click "Backup & remove"
- [ ] `Backups/<timestamp>/ghosts.zip` file exists in `%APPDATA%\mkw-ghost-share\Backups\`
- [ ] Import succeeds, removed ghost is gone, new ghost present

## Dolphin lock

- [ ] Open Dolphin (so it holds the rksys.dat lock)
- [ ] A sends → B accepts → status shows "Save file is locked (Dolphin open?). [Retry]"
- [ ] Close Dolphin, click Retry → import succeeds

## Discovery resilience

- [ ] Restart A → B's peer-status briefly shows "Searching for friend..." then reconnects
- [ ] No re-pairing required after either side restarts

## Auto-backup

- [ ] After several imports, `%APPDATA%\mkw-ghost-share\Backups\auto\` contains rotating snapshots (max 10)

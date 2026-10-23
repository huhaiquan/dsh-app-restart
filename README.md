# Auto Restart (dsh-app-restart)

A small DSH bundle with one control: a compact restart button in the window's
caption strip, immediately left of the native minimize/maximize/close buttons.
Clicking it quits the DeepSeek Harness desktop application and starts it again
automatically, so the normal app window comes back without closing and reopening
things by hand.

## What it adds

| Half | File | Role |
|---|---|---|
| Host | `index.js` | Serves `GET /.dsh-app-restart/status` and `POST /.dsh-app-restart/restart` on the Web GUI origin. |
| Host | `restart-helper.mjs` | Detached Node-mode companion that stops the shell, lets the Host finish its own shutdown, and relaunches the packaged executable. |
| Client | `client.js` | Registers the caption-strip control into `shell.overlay` and a fallback control into `conversation.session.header.utilities`; both call the route. |
| Meta | `locale/*.json`, `icon.svg` | Plugin Manager / Settings title, description and icon. |

## Where the button sits

The Windows Electron shell owns the caption strip: its preload marks the window
with `data-windows-titlebar` and reserves `--dsh-windows-titlebar-height` (40px),
while the native window buttons stay Electron's `titleBarOverlay`. The slot
ledger has no seat inside that strip, so the control is rendered through the
frame-wide `shell.overlay` seat and positioned with the Window Controls Overlay
safe area: `env(titlebar-area-x) + env(titlebar-area-width)` is the right edge of
the draggable area, i.e. exactly where the native buttons begin. Plain `top` /
`left` declarations precede the `env()` ones, so a build without that geometry
still places the control clear of the native buttons (three 46px caption buttons
plus a gap) instead of overlapping them.

Where the shell draws no caption strip (a browser tab, `dsh web`, macOS), the
same component registers in the session header's right-aligned utilities row
instead, and the caption entry renders nothing. Exactly one control is visible at
a time.

The caption control is deliberately the size of one native caption button — the
shell's 40px caption height by the native 46px width — so its hover fill is the
same full-height rectangle as the minimize button's, unrounded and flush against
the native group, rather than a rounded 28px icon button.

## How the restart works

The Host runs as a child of the Electron shell in Node mode, so it cannot call
Electron's `app.relaunch()`. On a restart request the Host answers first, then
starts `restart-helper.mjs` detached. The helper:

1. waits ~0.7 s so the response reaches the page;
2. stops the **shell** first — `taskkill /F` *without* `/T`, so only the shell
   goes and the helper (a child of the Host) is never part of the sweep. The shell
   must go first because it treats any Host exit as a crash and would otherwise
   write a crash report and open a recovery dialog;
3. lets the **Host** stop itself: killing the shell closes the IPC channel, and
   the Host's `disconnect` handler runs its ordinary shutdown (the same session
   flush a normal quit performs). It is force-stopped only if it outlives a short
   grace period;
4. waits for both processes to be gone, then spawns the packaged executable again
   with `ELECTRON_RUN_AS_NODE` removed from the environment.

The relaunched application starts the same way a normal launch does, so its
window appears again and the previous conversation is still in the session log.

## Limits

- Automatic restart is desktop-only. In a browser-hosted `dsh web` the status
  route reports `supported: false` and the control stays disabled; relaunching
  the shell would otherwise be meaningless.
- The desktop Host binds an OS-assigned port on every launch. A page served
  through the Electron window (`dsh-app://app/`) comes back with the new
  application window, but a browser tab that pointed at the old
  `http://127.0.0.1:<port>` address cannot follow the new port.
- A running turn is interrupted. Open sessions are flushed best effort before
  the process stops, but the interrupted turn is not resumed.

## Where this lives

Published repository: <https://github.com/huhaiquan/dsh-app-restart>

The author's installed copy is a local package, not a registry install: its
source lives in the profile directory beside every other plugin, at
`$DSH_PROFILE_DIR/local-plugins/dsh-app-restart`.

`plugin_manager install_bundle` records it as a `link:` dependency, so the
profile's `node_modules/@local/dsh-app-restart` is a symlink to that directory —
the same shape as any other installed plugin folder — and the bundle entry in
`package.json`'s `dsh.profile.bundles` makes it load. Editing files there takes
effect on the next page reload / restart; no reinstall is needed.

## Changelog

- **1.0.1** — caption-strip placement sized like a native window button; restart
  order fixed (shell first, Host finishes its own shutdown) so the shell no
  longer reports a crash dialog.
- **1.0.0** — initial restart control.

## Install

```sh
# from GitHub (git channel): installs the bundle from this repository
dsh plugin --profile <profile> add github:huhaiquan/dsh-app-restart

# or from a local checkout, through the official install path
plugin_manager install_bundle target=<absolute path to this directory>
```

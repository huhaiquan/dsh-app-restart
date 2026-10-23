# Auto Restart (dsh-app-restart)

English | [简体中文](README.zh-CN.md)

A one-click restart control for the DeepSeek Harness desktop app. A small circular
arrow sits in the window caption strip, immediately left of the native
minimize/maximize/close buttons; clicking it quits the app and relaunches it, so
the window comes back by itself.

## Install

```sh
# from this repository
dsh plugin --profile <profile> add github:huhaiquan/dsh-app-restart
```

Or install a local checkout through the official path:

```sh
plugin_manager install_bundle target=<absolute path to this directory>
```

## Use

1. The button sits in the caption strip, sized and highlighted like a native
   window button. In a browser tab or `dsh web` it appears in the session header
   instead.
2. Click it and confirm.
3. The window closes and reopens by itself within a few seconds; the conversation
   is still in the session list.

## Notes

- Desktop app only. In a browser-hosted `dsh web` the control is disabled.
- The app binds a new port on every launch, so a browser tab pointed at the old
  `http://127.0.0.1:<port>` address cannot follow it — the reopened app window can.
- A running turn is interrupted; open sessions are flushed before the app stops.

## Remove

Uninstall it from the Plugins page, or run:

```sh
dsh plugin --profile <profile> remove @local/dsh-app-restart
```

Repository: <https://github.com/huhaiquan/dsh-app-restart>

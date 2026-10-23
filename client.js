/**
 * Auto Restart — Client half.
 *
 * Draws the restart control and asks the Host half to perform the
 * exit-and-relaunch. Two seats, mutually exclusive:
 *
 *  - Desktop Windows Electron window: the window-caption strip, immediately left
 *    of the native minimize/maximize/close buttons. The shell (preload) marks
 *    that window with `data-windows-titlebar`; its caption height comes from
 *    `--dsh-windows-titlebar-height`, and `env(titlebar-area-x/width/height)`
 *    exposes the draggable safe area, whose right edge is the native caption
 *    buttons (Electron's Window Controls Overlay for `titleBarOverlay`).
 *    Rendered through the frame-wide `shell.overlay` seat.
 *  - Everywhere else (a browser tab, `dsh web`, or macOS): the session header's
 *    right-aligned utilities row (`conversation.session.header.utilities`).
 *
 * Visible copy goes through the Client locale service. The module registers a
 * lazy factory; every side effect lives inside `apply` and is released through
 * `ctx.effect`, so disabling the plugin removes both seats.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-app-restart',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-app-restart'
    const ROUTE = '/.dsh-app-restart'
    const HEADER = 'x-dsh-app-restart'

    const MESSAGES = {
      zh: {
        title: '重启应用',
        confirm: '确定要重启 DeepSeek Harness 吗？\n应用会立即退出并自动重新启动；正在生成的回合会被中断。\n若你正在浏览器中访问，页面会断开，请回到自动重新打开的应用窗口。',
        restarting: '正在重启 DeepSeek Harness…',
        checking: '正在检查重启能力…',
        unsupported: '自动重启仅在 DeepSeek Harness 桌面应用中可用',
        failed: '重启失败',
      },
      en: {
        title: 'Restart app',
        confirm: 'Restart DeepSeek Harness?\nThe app will quit and relaunch automatically; a running turn will be interrupted.\nIf you are viewing this in a browser tab, continue in the application window that reopens.',
        restarting: 'Restarting DeepSeek Harness…',
        checking: 'Checking restart availability…',
        unsupported: 'Automatic restart is only available in the DeepSeek Harness desktop app',
        failed: 'Restart failed',
      },
    }

    const CSS = `
.dsh-app-restart-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  line-height: 0;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.dsh-app-restart-control:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.16));
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-app-restart-control:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #247bbf);
  outline-offset: 1px;
}
.dsh-app-restart-control:disabled {
  cursor: default;
  opacity: 0.55;
}
.dsh-app-restart-control[data-phase="working"] svg {
  animation: dsh-app-restart-spin 900ms linear infinite;
}
.dsh-app-restart-control[data-phase="error"] {
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
/*
 * Window-caption placement (Windows Electron). The caption strip is a window
 * chrome region owned by the shell, so the control is anchored to the right edge
 * of the draggable safe area: the native minimize/maximize/close buttons start
 * there. It is the same size as one native caption button — the shell's 40px
 * caption height by the native 46px width — so its hover fill reads as a fourth
 * caption button flush against the native group, with no rounding of its own.
 * The plain declarations before the env() ones keep it in that place when the
 * Window Controls Overlay geometry is unavailable (three 46px buttons plus the
 * 40px caption height).
 */
.dsh-app-restart-control[data-variant="titlebar"] {
  position: fixed;
  z-index: 30;
  top: 0;
  left: calc(100vw - 184px);
  top: env(titlebar-area-y, 0px);
  left: calc(env(titlebar-area-x, 0px) + env(titlebar-area-width, calc(100vw - 138px)) - 46px);
  width: 46px;
  height: 40px;
  height: env(titlebar-area-height, 40px);
  border-radius: 0;
  -webkit-app-region: no-drag;
  pointer-events: auto;
}
/* Native caption hover: the full button rectangle, no rounding, a neutral
   translucent fill that only swaps the icon to the primary label color. */
.dsh-app-restart-control[data-variant="titlebar"]:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: var(--dsw-alias-label-primary, inherit);
}
body[data-ds-dark-theme] .dsh-app-restart-control[data-variant="titlebar"]:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
}
.dsh-app-restart-control[data-variant="titlebar"]:active:not(:disabled) {
  background: rgba(0, 0, 0, 0.09);
}
body[data-ds-dark-theme] .dsh-app-restart-control[data-variant="titlebar"]:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.dsh-app-restart-control[data-variant="titlebar"]:focus-visible {
  outline-offset: -2px;
}
@keyframes dsh-app-restart-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-app-restart-control[data-phase="working"] svg { animation: none; }
}
`

    const ICON = h(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
      h('path', { d: 'M21 3v6h-6' }),
    )

    /** Reader's language, used only when the locale service is unavailable. */
    function fallbackLocale() {
      const language = typeof navigator === 'object' && navigator !== null ? String(navigator.language ?? '') : ''
      return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    /** Dictionary lookup without the locale service. */
    function fallbackTranslate(key) {
      const preferred = MESSAGES[fallbackLocale()] ?? MESSAGES.en
      if (preferred[key] !== undefined) return preferred[key]
      return MESSAGES.en[key] ?? key
    }

    /** Whether the shell reserves the native caption strip for this window. */
    function titlebarMode() {
      try {
        return document.documentElement.hasAttribute('data-windows-titlebar')
      } catch {
        return false
      }
    }

    /** Restart state shared by both seats: probe availability, then request. */
    function useRestartAction(t, enabled) {
      const [phase, setPhase] = React.useState('idle')
      const [availability, setAvailability] = React.useState('checking')
      const [detail, setDetail] = React.useState('')
      const mounted = React.useRef(true)

      React.useEffect(() => {
        mounted.current = true
        if (!enabled) return
        const controller = typeof AbortController === 'function' ? new AbortController() : undefined
        fetch(`${ROUTE}/status`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
          signal: controller === undefined ? undefined : controller.signal,
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`status ${String(response.status)}`))))
          .then((body) => {
            if (mounted.current) setAvailability(body !== null && body.supported === true ? 'ready' : 'unsupported')
          })
          .catch(() => {
            if (mounted.current) setAvailability('unknown')
          })
        return () => {
          mounted.current = false
          controller?.abort()
        }
      }, [enabled])

      const onClick = React.useCallback(() => {
        if (phase === 'working') return
        if (typeof window.confirm === 'function' && !window.confirm(t('confirm'))) return
        setPhase('working')
        setDetail('')
        fetch(`${ROUTE}/restart`, {
          method: 'POST',
          headers: { [HEADER]: '1', accept: 'application/json' },
          cache: 'no-store',
        })
          .then(async (response) => {
            let body = null
            try {
              body = await response.json()
            } catch {
              body = null
            }
            if (!response.ok || body === null || body.ok !== true) {
              const reason = body !== null && typeof body.reason === 'string' ? body.reason : `HTTP ${String(response.status)}`
              throw new Error(reason)
            }
          })
          .catch((error) => {
            if (!mounted.current) return
            setPhase('error')
            setDetail(String((error !== null && typeof error === 'object' && error.message) || error))
          })
      }, [phase, t])

      return { phase, availability, detail, onClick }
    }

    function RestartControl(props) {
      const t = props.t
      const variant = props.variant === 'titlebar' ? 'titlebar' : 'header'
      const visible = titlebarMode() === (variant === 'titlebar')
      const action = useRestartAction(t, visible)
      if (!visible) return null

      const unsupported = action.availability === 'unsupported'
      const busy = action.phase === 'working'
      let title = t('title')
      if (action.availability === 'checking') title = t('checking')
      else if (unsupported) title = t('unsupported')
      else if (busy) title = t('restarting')
      else if (action.phase === 'error') title = `${t('failed')}: ${action.detail}`

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style', dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'button',
          {
            key: 'button',
            type: 'button',
            className: 'dsh-app-restart-control',
            'data-variant': variant,
            'data-phase': action.phase,
            'data-availability': action.availability,
            title,
            'aria-label': t('title'),
            'aria-busy': busy,
            disabled: busy || unsupported,
            onClick: action.onClick,
          },
          ICON,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        let t = fallbackTranslate
        try {
          if (ctx.locale !== undefined && ctx.locale !== null) {
            ctx.effect(() => ctx.locale.register(NS, 'zh', MESSAGES.zh), 'dsh-app-restart: zh dictionary')
            ctx.effect(() => ctx.locale.register(NS, 'en', MESSAGES.en), 'dsh-app-restart: en dictionary')
            const bound = ctx.locale.bind(NS)
            t = (key) => {
              try {
                const text = bound(key)
                return text === key ? fallbackTranslate(key) : text
              } catch {
                return fallbackTranslate(key)
              }
            }
          }
        } catch (error) {
          console.warn('[dsh-app-restart] locale service unavailable:', error)
        }

        // Window-caption seat: present for the whole window, independent of a Session.
        ctx.effect(
          () => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-app-restart:titlebar',
            order: 30,
            registrant: 'dsh-app-restart',
            label: () => t('title'),
          }, () => h(RestartControl, { t, variant: 'titlebar' }))),
          'dsh-app-restart: caption control',
        )

        // Header seat: the fallback where the shell draws no native caption strip.
        ctx.effect(
          () => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
            name: 'conversation.session.header.utilities',
            id: 'dsh-app-restart:button',
            order: 30,
            registrant: 'dsh-app-restart',
            label: () => t('title'),
          }, () => h(RestartControl, { t, variant: 'header' }))),
          'dsh-app-restart: header control',
        )
      },
    }
  },
})

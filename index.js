/**
 * Auto Restart — Host half.
 *
 * Owns one small route on the Web GUI origin:
 *
 *   GET  /.dsh-app-restart/status   facts about the running desktop application
 *   POST /.dsh-app-restart/restart  stop the application and start it again
 *
 * The Host process is a child of the Electron shell launched in Node mode, so it
 * cannot call Electron's `app.relaunch()`. It hands that job to
 * `restart-helper.mjs`: a detached Node-mode companion that stops the Host, stops
 * the shell, and starts the packaged executable again, which reopens the normal
 * application window.
 *
 * @module @local/dsh-app-restart
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Host services this plugin needs before it applies. */
export const inject = ['webServer']

const LOG = '[dsh-app-restart]'
const PREFIX = '/.dsh-app-restart'
/** Required on the restart request: a cross-origin page cannot send it unnoticed. */
const HEADER = 'x-dsh-app-restart'
const HELPER = fileURLToPath(new URL('./restart-helper.mjs', import.meta.url))
/** How long the response waits for session persistence before the restart starts. */
const FLUSH_DEADLINE_MS = 800

/**
 * Describe the process tree this route may restart.
 * @param ctx - Host context holding `webServer`.
 * @returns Runtime facts; `supported` is false outside a packaged desktop app.
 */
function inspectRuntime(ctx) {
	const executable = process.execPath
	const appRoot = dirname(executable)
	const packaged = existsSync(join(appRoot, 'resources', 'app.asar'))
	const electron = typeof process.versions.electron === 'string'
	const hostPid = process.pid
	const mainPid = process.ppid
	let reason = null
	if (!electron) reason = 'not-running-in-desktop-app'
	else if (!packaged) reason = 'desktop-app-bundle-not-found'
	else if (!(Number.isSafeInteger(mainPid) && mainPid > 0)) reason = 'electron-shell-pid-unavailable'
	return {
		supported: reason === null,
		reason,
		platform: process.platform,
		electronVersion: process.versions.electron ?? null,
		executable,
		appRoot,
		hostPid,
		mainPid,
		origin: requestOrigin(ctx),
	}
}

/** The Web GUI origin, when the listener is already bound. */
function requestOrigin(ctx) {
	try {
		return ctx.webServer.getOrigin()
	} catch {
		return undefined
	}
}

/** Write one JSON response and finish it. */
function sendJson(res, status, value) {
	const body = `${JSON.stringify(value)}\n`
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(body),
	})
	res.end(body)
}

/** Refuse a request without a JSON body. */
function reject(res, status) {
	res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
	res.end(status === 404 ? 'not found' : 'forbidden')
}

/**
 * Persist the sessions that are open right now, best effort and time-boxed:
 * the restart helper stops this process shortly after, so a slow disk must not
 * hold the request open.
 * @param ctx - Host context.
 */
async function flushSessions(ctx) {
	let sessions
	try {
		sessions = ctx.get('sessions')
	} catch {
		return
	}
	if (sessions === undefined || typeof sessions.list !== 'function' || typeof sessions.flush !== 'function') return
	const flushes = sessions.list().map((session) => Promise.resolve().then(() => sessions.flush(session)))
	await Promise.race([
		Promise.allSettled(flushes),
		new Promise((resolve) => {
			const timer = setTimeout(resolve, FLUSH_DEADLINE_MS)
			timer.unref?.()
		}),
	])
}

/**
 * Start the detached helper that performs the actual exit and relaunch.
 * @param runtime - Facts from {@link inspectRuntime}.
 */
function startHelper(runtime) {
	const child = spawn(
		runtime.executable,
		[HELPER, String(runtime.hostPid), String(runtime.mainPid), runtime.executable],
		{
			cwd: runtime.appRoot,
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		},
	)
	child.once('error', (error) => {
		console.error(LOG, 'restart helper failed to start:', error)
	})
	child.unref()
	console.info(LOG, 'restart scheduled', {
		helperPid: child.pid ?? null,
		hostPid: runtime.hostPid,
		mainPid: runtime.mainPid,
	})
}

/**
 * Mount the restart route.
 * @param ctx - Host context.
 */
export function apply(ctx) {
	let scheduled = false

	async function restart(req, res) {
		if (req.headers[HEADER] !== '1') {
			reject(res, 403)
			return
		}
		const origin = req.headers.origin
		const expected = requestOrigin(ctx)
		if (typeof origin === 'string' && /^https?:/iu.test(origin) && origin !== expected) {
			reject(res, 403)
			return
		}
		req.resume()
		const runtime = inspectRuntime(ctx)
		if (!runtime.supported) {
			sendJson(res, 409, { ok: false, reason: runtime.reason })
			return
		}
		if (scheduled) {
			sendJson(res, 202, { ok: true, alreadyScheduled: true })
			return
		}
		scheduled = true
		try {
			await flushSessions(ctx)
			startHelper(runtime)
		} catch (error) {
			scheduled = false
			console.error(LOG, 'restart failed:', error)
			sendJson(res, 500, { ok: false, reason: 'restart-failed' })
			return
		}
		sendJson(res, 200, {
			ok: true,
			hostPid: runtime.hostPid,
			mainPid: runtime.mainPid,
		})
	}

	async function handle(req, res) {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1')
		const pathname = url.pathname
		if (pathname === PREFIX || pathname === `${PREFIX}/`) {
			reject(res, 404)
			return
		}
		if (pathname === `${PREFIX}/status`) {
			if (req.method === 'HEAD') {
				res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
				res.end()
				return
			}
			if (req.method !== 'GET') {
				reject(res, 404)
				return
			}
			sendJson(res, 200, { ok: true, ...inspectRuntime(ctx) })
			return
		}
		if (pathname === `${PREFIX}/restart`) {
			if (req.method !== 'POST') {
				reject(res, 404)
				return
			}
			await restart(req, res)
			return
		}
		reject(res, 404)
	}

	ctx.effect(
		() => ctx.webServer.register({
			kind: 'prefix',
			path: PREFIX,
			handler: (req, res) => {
				handle(req, res).catch((error) => {
					console.error(LOG, 'route failed:', error)
					try {
						if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
						res.end()
					} catch {
						/* The socket may already be gone. */
					}
				})
			},
		}),
		'dsh-app-restart: restart route',
	)
}

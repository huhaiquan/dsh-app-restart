/**
 * Restart companion for @local/dsh-app-restart.
 *
 * Started by the Host half as a detached Electron Node-mode child:
 *
 *   electron-node restart-helper.mjs <hostPid> <mainPid> <executable> [extra args...]
 *
 * Order matters. The shell treats any Host exit as a crash: it writes a crash
 * report and opens a recovery dialog. So the shell is stopped first, and it is
 * stopped with `taskkill /F` *without* `/T`, which kills only that process and
 * never sweeps this helper (a child of the Host) out with the tree. The Host then
 * sees its IPC channel to the shell close, and its `disconnect` handler runs the
 * ordinary shutdown — the same session flush a normal quit performs — so it gets a
 * grace period and is force-stopped only if it lingers. The final step starts the
 * packaged executable again, so the application window reappears by itself, with
 * no crash report and no recovery prompt.
 *
 * @module @local/dsh-app-restart/restart-helper
 */
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

/** Wait before touching anything, so the HTTP response reaches the page first. */
const INITIAL_DELAY_MS = 700
/** How long the Host gets to finish its own shutdown after the shell is gone. */
const HOST_GRACE_MS = 2500
/** Extra wait after both processes are gone, before the executable starts again. */
const RELAUNCH_DELAY_MS = 700

const hostPid = Number(process.argv[2])
const mainPid = Number(process.argv[3])
const executable = process.argv[4]
const extraArgs = process.argv.slice(5)

const sleep = (ms) => new Promise((resolve) => {
	setTimeout(resolve, ms)
})

/** Whether a signal can still be delivered to this process. */
function isAlive(pid) {
	if (!Number.isSafeInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error?.code === 'EPERM'
	}
}

/** Poll until the process is gone or the deadline passes. */
async function waitGone(pid, timeoutMs) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isAlive(pid)) return true
		await sleep(100)
	}
	return !isAlive(pid)
}

/** Terminate one process; Windows has no graceful signal, which matches intent. */
function terminate(pid) {
	try {
		process.kill(pid)
	} catch {
		/* Already gone. */
	}
}

/**
 * Stop one Windows process with `taskkill`.
 * `tree` also stops everything the process started; it is off for the shell so
 * that this helper, which lives under the Host, is never part of the sweep.
 */
function taskkill(pid, tree) {
	return new Promise((resolve) => {
		const args = ['/PID', String(pid), '/F']
		if (tree) args.push('/T')
		let child
		try {
			child = spawn('taskkill', args, { stdio: 'ignore', windowsHide: true })
		} catch {
			resolve(false)
			return
		}
		child.once('error', () => resolve(false))
		child.once('exit', (code) => resolve(code === 0))
	})
}

/**
 * Stop the shell first. A restricted environment may refuse `taskkill`; the
 * process signal is the fallback, and the relaunch below must run either way.
 */
async function stopShell() {
	if (!isAlive(mainPid)) return
	try {
		if (process.platform === 'win32') {
			const stopped = await taskkill(mainPid, false)
			if (!stopped) terminate(mainPid)
		} else {
			try {
				process.kill(mainPid, 'SIGTERM')
			} catch {
				/* Already gone. */
			}
		}
		if (!(await waitGone(mainPid, 4000))) terminate(mainPid)
	} catch (error) {
		console.error('[dsh-app-restart] stopping the shell failed:', error)
		terminate(mainPid)
	}
	await waitGone(mainPid, 8000)
}

/**
 * Stop the Host. Killing the shell closes the IPC channel, so the Host normally
 * shuts itself down and flushes sessions; give it that grace before forcing it.
 */
async function stopHost() {
	if (!isAlive(hostPid)) return
	if (await waitGone(hostPid, HOST_GRACE_MS)) return
	terminate(hostPid)
	if (await waitGone(hostPid, 3000)) return
	await taskkill(hostPid, true)
	await waitGone(hostPid, 2000)
}

/** Start the packaged application again, outside Node mode. */
function relaunch() {
	const env = { ...process.env }
	delete env.ELECTRON_RUN_AS_NODE
	try {
		const child = spawn(executable, extraArgs, {
			cwd: dirname(executable),
			detached: true,
			stdio: 'ignore',
			windowsHide: false,
			env,
		})
		child.once('error', (error) => {
			console.error('[dsh-app-restart] relaunch failed:', error)
		})
		child.unref()
	} catch (error) {
		console.error('[dsh-app-restart] relaunch threw:', error)
	}
}

async function main() {
	if (!Number.isSafeInteger(hostPid) || !Number.isSafeInteger(mainPid) || typeof executable !== 'string' || executable === '') return
	await sleep(INITIAL_DELAY_MS)
	try {
		await stopShell()
		await stopHost()
	} catch (error) {
		console.error('[dsh-app-restart] stopping the application failed:', error)
	}
	// Always try to bring the application back, even after a failed stop.
	await sleep(RELAUNCH_DELAY_MS)
	relaunch()
	await sleep(200)
}

main()
	.catch((error) => {
		console.error('[dsh-app-restart] helper failed:', error)
	})
	.finally(() => {
		process.exit(0)
	})

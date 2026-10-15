import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Ask the OS for distinct free ports for this invocation, rather than sharing
// fixed ports across self-hosted runners. Strict binds still fail on a race.
const reservations = await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
  const server = createServer()
  server.on('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(server))
})))
const ports = reservations.map(server => server.address().port)
await Promise.all(reservations.map(server => new Promise(resolve => server.close(resolve))))
const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('Usage: run-isolated.mjs <command> [args...]')
const child = spawn(command, args, {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  stdio: 'inherit',
  env: { ...process.env, E2E_FRONTEND_PORT: String(ports[0]), E2E_API_PORT: String(ports[1]), UI_FRONTEND_URL: `http://127.0.0.1:${ports[2]}` },
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

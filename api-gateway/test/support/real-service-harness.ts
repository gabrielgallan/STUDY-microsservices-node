import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { Client } from 'pg'

export interface RunningService {
	process: ChildProcess
	getOutput: () => string
}

export interface HttpResult<T> {
	status: number
	body: T
}

export const delay = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds))

export const assertPortIsFree = (port: number, reason?: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const server = createServer()

		server.once('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'EADDRINUSE') {
				reject(
					new Error(
						reason ??
							`Port ${port} is already in use; the real E2E suite never stops external processes.`,
					),
				)
				return
			}

			reject(error)
		})

		server.listen(port, '127.0.0.1', () => {
			server.close(() => resolve())
		})
	})

export const startService = (
	serviceRoot: string,
	mainFile: string,
	environment: NodeJS.ProcessEnv,
): RunningService => {
	let output = ''
	const child = spawn(process.execPath, [mainFile], {
		cwd: serviceRoot,
		env: { ...process.env, ...environment },
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	})
	const collectOutput = (chunk: Buffer) => {
		output = `${output}${chunk.toString()}`.slice(-20_000)
	}

	child.stdout?.on('data', collectOutput)
	child.stderr?.on('data', collectOutput)

	return {
		process: child,
		getOutput: () => output,
	}
}

export const waitForService = async (
	url: string,
	service: RunningService,
	timeoutMilliseconds = 30_000,
): Promise<void> => {
	const deadline = Date.now() + timeoutMilliseconds

	while (Date.now() < deadline) {
		if (service.process.exitCode !== null) {
			throw new Error(`Service exited before becoming ready.\n${service.getOutput()}`)
		}

		try {
			const response = await fetch(url)

			if (response.ok) {
				return
			}
		} catch {
			// The process is still starting.
		}

		await delay(250)
	}

	throw new Error(`Timed out waiting for ${url}.\n${service.getOutput()}`)
}

export const stopService = async (
	service: RunningService | undefined,
): Promise<void> => {
	if (!service || service.process.exitCode !== null) {
		return
	}

	const waitForExit = async (timeoutMilliseconds: number): Promise<boolean> => {
		if (service.process.exitCode !== null) {
			return true
		}

		return new Promise((resolve) => {
			const onExit = () => {
				clearTimeout(timer)
				resolve(true)
			}
			const timer = setTimeout(() => {
				service.process.off('exit', onExit)
				resolve(false)
			}, timeoutMilliseconds)

			service.process.once('exit', onExit)
		})
	}

	service.process.kill()

	const exited = await waitForExit(5_000)

	if (!exited) {
		service.process.kill('SIGKILL')
		await waitForExit(5_000)
	}
}

export const requestJson = async <T>(
	url: string,
	init?: RequestInit,
): Promise<HttpResult<T>> => {
	const response = await fetch(url, init)
	const text = await response.text()

	return {
		status: response.status,
		body: (text ? JSON.parse(text) : undefined) as T,
	}
}

export const withDatabase = async (
	port: number,
	database: string,
	run: (client: Client) => Promise<void>,
): Promise<void> => {
	const client = new Client({
		host: '127.0.0.1',
		port,
		user: 'docker',
		password: 'docker',
		database,
	})

	try {
		await client.connect()
		await run(client)
	} finally {
		await client.end().catch(() => undefined)
	}
}

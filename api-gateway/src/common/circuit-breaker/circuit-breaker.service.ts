import { Injectable, Logger } from '@nestjs/common'
import { CircuitBreakerOptions, CircuitBreakerState } from './circuit-breaker.interface'

@Injectable()
export class CircuitBreakerService {
	private logger = new Logger(CircuitBreakerService.name)
	private circuits = new Map<string, CircuitBreakerState>()
	private defaultOptions: CircuitBreakerOptions = {
		failureThreshold: 5,
		timeout: 10000,
		resetTimeout: 30000,
	}

	async executeWithCircuitBreaker<T>(
		operation: () => Promise<T>,
		key: string,
		fallback?: () => Promise<T>,
		options: CircuitBreakerOptions = this.defaultOptions,
	) {
		const config = { ...this.defaultOptions, ...options }

		const circuit = this.getOrCreateCircuit(key, config)

		if (circuit.state === 'OPEN') {
			const now = Date.now()

			if (now < circuit.nextAttemptTime) {
				this.logger.warn(`Circuit for ${key} is OPEN. Returning fallback.`)

				if (fallback) {
					return await fallback()
				}
			} else {
				circuit.state = 'HALF_OPEN'
				this.logger.warn(`Circuit for ${key} is HALF_OPEN. Attempting operation.`)
			}
		}

		try {
			const result = await operation()

			this.onSucess(circuit, key)

			return result
		} catch (error: unknown) {
			this.onFailure(circuit, key, config)

			this.logger.error(
				`Operation for ${key} failed: ${error instanceof Error ? error.message : error}`,
			)

			if (fallback) {
				this.logger.warn(`Returning fallback for ${key} due to operation failure.`)
				return await fallback()
			}

			throw error
		}
	}

	private getOrCreateCircuit(
		key: string,
		options: CircuitBreakerOptions,
	): CircuitBreakerState {
		if (!this.circuits.has(key)) {
			this.circuits.set(key, {
				state: 'CLOSED',
				failureCount: 0,
				lastFailureTime: 0,
				nextAttemptTime: Date.now() + options.timeout,
			})
		}
		return this.circuits.get(key) as CircuitBreakerState
	}

	private onSucess(circuit: CircuitBreakerState, key: string) {
		circuit.failureCount = 0
		circuit.state = 'CLOSED'
		this.logger.log(`Circuit for ${key} is CLOSED. Operation succeeded.`)
	}

	private onFailure(
		circuit: CircuitBreakerState,
		key: string,
		options: CircuitBreakerOptions,
	) {
		circuit.failureCount++
		circuit.lastFailureTime = Date.now()

		if (circuit.failureCount >= options.failureThreshold) {
			circuit.state = 'OPEN'
			circuit.nextAttemptTime = Date.now() + options.resetTimeout
			this.logger.warn(`Circuit for ${key} is OPEN. Failure threshold reached.`)
		}
	}

	getCircuitState(key: string): CircuitBreakerState | undefined {
		return this.circuits.get(key)
	}

	getAllCircuits(): Map<string, CircuitBreakerState> {
		return this.circuits
	}

	resetCircuit(key: string): void {
		this.circuits.delete(key)
		this.logger.log(`Circuit breaker RESET for ${key}.`)
	}
}

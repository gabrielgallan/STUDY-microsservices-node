export interface CircuitBreakerOptions {
	failureThreshold: number
	timeout: number
	resetTimeout: number
}
export interface CircuitBreakerState {
	state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
	failureCount: number
	lastFailureTime: number
	nextAttemptTime: number
}

export interface CircuitBreakerResult<T> {
	success: boolean
	data?: T
	error?: Error
	fromCache?: boolean
}

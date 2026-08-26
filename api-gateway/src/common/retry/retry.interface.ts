export interface RetryOptions {
	maxRetries: number
	baseDelay: number
	maxDelay: number
	backoffMultiplies: number
	jitters: boolean
}

export interface RetryResult<T> {
	success: boolean
	data?: T
	error?: Error
	attempts: number
	totalTime: number
}

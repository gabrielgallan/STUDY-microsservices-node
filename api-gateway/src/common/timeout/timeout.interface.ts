export interface TimeoutOptions {
	/**
	 * The maximum time (in milliseconds) to wait for an operation to complete.
	 */
	timeout: number
	/**
	 * The number of times to retry an operation before giving up.
	 */
	retries: number
	/**
	 * The multiplier to use for the backoff time between retries.
	 */
	backoffMultiplier: number
	/**
	 * The maximum time (in milliseconds) to wait between retries.
	 */
	maxBackoff: number
}

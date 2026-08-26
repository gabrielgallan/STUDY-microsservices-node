type HealthStatus = 'healthy' | 'unhealthy' | 'degraded'

export interface ServiceHealth {
	name: string
	url: string
	status: HealthStatus
	responseTime: number
	lastCheck: Date
	error?: Error
}

import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { timeout } from 'rxjs'
import { firstValueFrom } from 'rxjs/internal/firstValueFrom'
import { serviceConfig } from '../../config/gateway.config'
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service'
import { ServiceHealth } from './health-check.interface'

@Injectable()
export class HealthCheckService {
	private logger = new Logger(HealthCheckService.name)
	private healthCache = new Map<string, ServiceHealth>()

	constructor(
		private httpService: HttpService,
		private circuitBreakerService: CircuitBreakerService,
	) {}

	async checkServicehealth(
		serviceName: keyof typeof serviceConfig,
	): Promise<ServiceHealth> {
		const service = serviceConfig[serviceName]
		const startTime = Date.now()

		try {
			const health = await this.circuitBreakerService.executeWithCircuitBreaker(
				async () => {
					const response = await firstValueFrom(
						this.httpService
							.get(`${service.url}/health`, {
								timeout: service.timeout,
							})
							.pipe(timeout(service.timeout)),
					)
					return response.status
				},
				serviceName,
				async () => {
					throw new Error(`Fallback: ${serviceName} service is unavailable.`)
				},
			)

			const responseTime = Date.now() - startTime
			const serviceHealth: ServiceHealth = {
				name: serviceName,
				url: service.url,
				status: health === 200 ? 'healthy' : 'unhealthy',
				responseTime,
				lastCheck: new Date(),
			}

			this.healthCache.set(serviceName, serviceHealth)

			return serviceHealth
		} catch (error: any) {
			const responseTime = Date.now() - startTime

			const serviceHealth: ServiceHealth = {
				name: serviceName,
				url: service.url,
				status: 'unhealthy',
				responseTime,
				lastCheck: new Date(),
				error: error as Error,
			}

			this.healthCache.set(serviceName, serviceHealth)

			this.logger.error(
				`Health check failed for ${serviceName} service: ${error?.message}`,
			)

			return serviceHealth
		}
	}

	async checkAllServices(): Promise<ServiceHealth[]> {
		const services: (keyof typeof serviceConfig)[] = [
			'users',
			'checkout',
			'products',
			'payments',
		]

		const healthChecks = await Promise.allSettled(
			services.map((serviceName) => this.checkServicehealth(serviceName)),
		)

		return healthChecks.map((result, index) => {
			if (result.status === 'fulfilled') {
				return result.value
			} else {
				const serviceName = services[index]
				const service = serviceConfig[serviceName]
				const responseTime = 0
				return {
					name: serviceName,
					url: service.url,
					status: 'unhealthy',
					responseTime,
					lastCheck: new Date(),
					error: result.reason as Error,
				}
			}
		})
	}

	getCachedHealth(serviceName: keyof typeof serviceConfig): ServiceHealth | undefined {
		return this.healthCache.get(serviceName)
	}

	getAllCachedHealth(): ServiceHealth[] {
		return Array.from(this.healthCache.values())
	}
}

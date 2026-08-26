import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { UserPayload } from '../../auth/strategies/jwt.strategy'
import { CircuitBreakerService } from '../../common/circuit-breaker/circuit-breaker.service'
import { CacheFallbackService } from '../../common/fallback/cache-fallback.service'
import { DefaultFallbackService } from '../../common/fallback/default-fallback.service'
import { RetryService } from '../../common/retry/retry.service'
import { TimeoutService } from '../../common/timeout/timeout.service'
import { serviceConfig } from '../../config/gateway.config'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

@Injectable()
export class ProxyService {
	private logger = new Logger(ProxyService.name)

	constructor(
		private httpServer: HttpService,
		private circuitBreakerService: CircuitBreakerService,
		private defaultFallbackService: DefaultFallbackService,
		private cacheFallbackService: CacheFallbackService,
		private timeoutService: TimeoutService,
		private retryService: RetryService,
	) {}

	async proxyRequest(
		serviceName: keyof typeof serviceConfig,
		method: HttpMethod,
		path: string,
		data?: unknown,
		headers?: Record<string, string>,
		userInfo?: UserPayload,
	) {
		const service = serviceConfig[serviceName]

		const url = `${service.url}${path}`

		this.logger.log(`Proxying ${method} request to ${serviceName} service at: ${url}`)

		const fallback = this.createServiceFallback(serviceName, method, path)

		// Layer 1: Circuit Breaker
		return await this.circuitBreakerService.executeWithCircuitBreaker(
			async () => {
				// Layer 2: Retry
				return await this.retryService.executeWithExponentialBackoff(async () => {
					// Layer 3: Timeout
					return await this.timeoutService.executeWithCustomTimeout(async () => {
						const enhancedHeaders = {
							...headers,
							'x-user-id': userInfo?.userId,
							'x-user-email': userInfo?.email,
							'x-user-role': userInfo?.role,
						}

						const response = await firstValueFrom(
							this.httpServer.request({
								method: method.toLowerCase(),
								url,
								data,
								headers: enhancedHeaders,
								timeout: service.timeout,
							}),
						)

						if (method.toLowerCase() === 'get') {
							this.cacheFallbackService.setCachedData(
								`${serviceName}-${path}`,
								response.data,
							)
						}

						return response.data
					}, service.timeout)
				}, 4)
			},
			`proxy-${serviceName}`,
			fallback,
			{ failureThreshold: 3, timeout: 30000, resetTimeout: 30000 },
		)
	}

	createServiceFallback(serviceName: string, method: string, path: string) {
		switch (serviceName) {
			case 'user':
				if (path.includes('/auth')) {
					return this.defaultFallbackService.createErrorFallback(
						serviceName,
						'Authentication service is currently unavailable. Please try again later.',
					)
				}

				return this.defaultFallbackService.createErrorFallback(
					serviceName,
					'User service is currently unavailable. Please try again later.',
				)
			case 'products':
				if (method.toLowerCase() === 'get') {
					return this.cacheFallbackService.createCacheFallback(`products-${path}`, {
						products: [],
					})
				}

				return this.defaultFallbackService.createErrorFallback(
					serviceName,
					'Products service is currently unavailable. Please try again later.',
				)
			case 'checkout':
				return this.defaultFallbackService.createErrorFallback(
					serviceName,
					'Checkout service is currently unavailable. Please try again later.',
				)
			case 'payments':
				return this.defaultFallbackService.createErrorFallback(
					serviceName,
					'Payments service is currently unavailable. Please try again later.',
				)
			default:
				return this.cacheFallbackService.createCacheFallback(
					serviceName,
					'Service unavailable. Please try again later.',
				)
		}
	}
}

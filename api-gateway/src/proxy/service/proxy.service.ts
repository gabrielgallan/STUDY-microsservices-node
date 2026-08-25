import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { UserPayload } from '../../auth/strategies/jwt.strategy'
import { serviceConfig } from '../../config/gateway.config'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

@Injectable()
export class ProxyService {
	private logger = new Logger(ProxyService.name)

	constructor(private httpServer: HttpService) {}

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

		try {
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

			return response
		} catch (error) {
			this.logger.error(
				`Error proxying request to ${serviceName} service at: ${url}`,
				error,
			)
			throw error
		}
	}

	async getServiceHealth(serviceName: keyof typeof serviceConfig) {
		const service = serviceConfig[serviceName]

		const url = `${service.url}/health`

		try {
			const response = await firstValueFrom(
				this.httpServer.get(url, {
					timeout: 3000,
				}),
			)

			return { status: 'healthy', data: response.data }
		} catch (error: unknown) {
			return {
				status: 'unhealthy',
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		}
	}
}

import { Controller, Get } from '@nestjs/common'
import { ProxyService } from '../proxy/service/proxy.service'

@Controller('/health')
export class HealthController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get()
	async handle() {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			services: {
				users: await this.proxyService.getServiceHealth('users'),
				products: await this.proxyService.getServiceHealth('products'),
				checkout: await this.proxyService.getServiceHealth('checkout'),
				payments: await this.proxyService.getServiceHealth('payments'),
			},
		}
	}
}

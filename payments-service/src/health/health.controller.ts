import { Controller, Get } from '@nestjs/common'

interface HealthResponse {
	status: 'ok'
	service: 'payments-service'
}

@Controller('health')
export class HealthController {
	@Get()
	getHealth(): HealthResponse {
		return {
			status: 'ok',
			service: 'payments-service',
		}
	}
}

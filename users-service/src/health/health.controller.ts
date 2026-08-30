import { Controller, Get } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'

interface HealthResponse {
	status: 'ok'
	service: 'users-service'
}

@Controller('health')
export class HealthController {
	@Get()
	@Public()
	getHealth(): HealthResponse {
		return {
			status: 'ok',
			service: 'users-service',
		}
	}
}

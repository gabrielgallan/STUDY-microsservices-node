import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'

interface HealthResponse {
	status: 'ok'
	service: 'checkout-service'
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
	@Get()
	@Public()
	getHealth(): HealthResponse {
		return {
			status: 'ok',
			service: 'checkout-service',
		}
	}
}

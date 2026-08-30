import { Controller, Get, Headers, Param, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ProxyService } from '../proxy/service/proxy.service'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsProxyController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get(':orderId')
	@ApiOperation({ summary: 'Get the payment of an order' })
	findByOrderId(
		@Param('orderId') orderId: string,
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'payments',
			'get',
			`/payments/${orderId}`,
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}
}

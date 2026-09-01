import {
	Controller,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	Req,
	UseGuards,
} from '@nestjs/common'
import {
	ApiBearerAuth,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger'
import type { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ApiExceptionResponseDto } from '../dtos/api-exeption-response.dto'
import { ProxyService } from '../proxy/service/proxy.service'
import { GetPaymentByOrderIdResponseDto } from './dtos/get-payment-by-order-id.dto'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsProxyController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get(':orderId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get the payment of an order' })
	@ApiParam({
		name: 'orderId',
		description: 'Identifier of the order the payment belongs to',
		example: '6e5d4c3b-2a19-4f87-b6c5-d4e3f2a1b098',
	})
	@ApiResponse({
		status: 200,
		description: 'Payment of the order',
		type: GetPaymentByOrderIdResponseDto,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid order identifier',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 401,
		description: 'Missing, invalid or expired token',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 404,
		description: 'The order has no payment yet',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 500,
		description: 'Payments service is currently unavailable',
		type: ApiExceptionResponseDto,
	})
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

import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ProxyService } from '../proxy/service/proxy.service'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Checkout')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersProxyController {
	constructor(private readonly proxyService: ProxyService) {}

	@Post('cart/checkout')
	@ApiOperation({ summary: 'Finish the active cart and create an order' })
	checkout(
		@Body() input: Record<string, unknown>,
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'checkout',
			'post',
			'/cart/checkout',
			input,
			{ Authorization: authorization },
			request.user,
		)
	}

	@Get('orders')
	@ApiOperation({ summary: 'List the orders of the authenticated user' })
	findAll(
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'checkout',
			'get',
			'/orders',
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}

	@Get('orders/:id')
	@ApiOperation({ summary: 'Get an order by ID' })
	findById(
		@Param('id') id: string,
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'checkout',
			'get',
			`/orders/${id}`,
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}
}

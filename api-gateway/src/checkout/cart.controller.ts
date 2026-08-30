import {
	Body,
	Controller,
	Delete,
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
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartProxyController {
	constructor(private readonly proxyService: ProxyService) {}

	@Post('items')
	@ApiOperation({ summary: 'Add an item to the cart' })
	addItem(
		@Body() input: Record<string, unknown>,
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'checkout',
			'post',
			'/cart/items',
			input,
			{ Authorization: authorization },
			request.user,
		)
	}

	@Get()
	@ApiOperation({ summary: 'Get the active cart of the authenticated user' })
	getCart(
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'checkout',
			'get',
			'/cart',
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}

	@Delete('items/:itemId')
	@ApiOperation({ summary: 'Remove an item from the cart' })
	removeItem(
		@Param('itemId') itemId: string,
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'checkout',
			'delete',
			`/cart/items/${itemId}`,
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}
}

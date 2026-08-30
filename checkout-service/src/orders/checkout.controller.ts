import { Body, Controller, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface'
import { CheckoutDto } from './dtos/checkout.dto'
import type { OrderResponse } from './dtos/order-response'
import { OrdersService } from './orders.service'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@ApiTags('Checkout')
@ApiBearerAuth('bearer')
@Controller('cart')
export class CheckoutController {
	constructor(private readonly ordersService: OrdersService) {}

	@Post('checkout')
	checkout(
		@Body() input: CheckoutDto,
		@Req() request: AuthenticatedRequest,
	): Promise<OrderResponse> {
		return this.ordersService.checkout(request.user.id, input)
	}
}

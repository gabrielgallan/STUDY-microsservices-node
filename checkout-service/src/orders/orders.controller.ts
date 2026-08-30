import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface'
import type { OrderResponse } from './dtos/order-response'
import { OrdersService } from './orders.service'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@ApiTags('Orders')
@ApiBearerAuth('bearer')
@Controller('orders')
export class OrdersController {
	constructor(private readonly ordersService: OrdersService) {}

	@Get()
	findAll(@Req() request: AuthenticatedRequest): Promise<OrderResponse[]> {
		return this.ordersService.findAllByUser(request.user.id)
	}

	@Get(':id')
	findById(
		@Param('id', new ParseUUIDPipe()) id: string,
		@Req() request: AuthenticatedRequest,
	): Promise<OrderResponse> {
		return this.ordersService.findByIdForUser(request.user.id, id)
	}
}

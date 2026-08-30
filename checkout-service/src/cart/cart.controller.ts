import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface'
import { CartService } from './cart.service'
import { AddCartItemDto } from './dtos/add-cart-item.dto'
import type { CartResponse } from './dtos/cart-response'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@ApiTags('Cart')
@ApiBearerAuth('bearer')
@Controller('cart')
export class CartController {
	constructor(private readonly cartService: CartService) {}

	@Get()
	getCart(@Req() request: AuthenticatedRequest): Promise<CartResponse> {
		return this.cartService.getCart(request.user.id)
	}

	@Post('items')
	addItem(
		@Body() input: AddCartItemDto,
		@Req() request: AuthenticatedRequest,
	): Promise<CartResponse> {
		return this.cartService.addItem(request.user.id, input)
	}

	@Delete('items/:itemId')
	removeItem(
		@Param('itemId', new ParseUUIDPipe()) itemId: string,
		@Req() request: AuthenticatedRequest,
	): Promise<CartResponse> {
		return this.cartService.removeItem(request.user.id, itemId)
	}
}

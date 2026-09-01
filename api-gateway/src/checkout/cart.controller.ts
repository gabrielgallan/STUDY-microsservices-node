import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	Post,
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
import { ZodValidationPipe } from '../pipes/zod-validation.pipe'
import { ProxyService } from '../proxy/service/proxy.service'
import {
	AddCartItemDto,
	AddCartItemResponseDto,
	addCartItemSchema,
} from './dtos/add-cart-item.dto'
import { GetCartResponseDto } from './dtos/get-cart.dto'
import { RemoveCartItemResponseDto } from './dtos/remove-cart-item.dto'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Checkout')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartProxyController {
	constructor(private readonly proxyService: ProxyService) {}

	@Post('items')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Add an item to the cart' })
	@ApiResponse({
		status: 201,
		description: 'Cart after the item was added',
		type: AddCartItemResponseDto,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid data',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 401,
		description: 'Missing, invalid or expired token',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 404,
		description: 'Product not found',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 422,
		description: 'Product unavailable',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 500,
		description: 'Checkout service is currently unavailable',
		type: ApiExceptionResponseDto,
	})
	addItem(
		@Body(new ZodValidationPipe(addCartItemSchema)) input: AddCartItemDto,
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
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get the active cart of the authenticated user' })
	@ApiResponse({
		status: 200,
		description: 'Active cart of the authenticated user',
		type: GetCartResponseDto,
	})
	@ApiResponse({
		status: 401,
		description: 'Missing, invalid or expired token',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 500,
		description: 'Checkout service is currently unavailable',
		type: ApiExceptionResponseDto,
	})
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
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Remove an item from the cart' })
	@ApiParam({
		name: 'itemId',
		description: 'Identifier of the cart item',
		example: 'c19b7e40-5a2d-4f9c-9b3a-1e8d6f4c2b57',
	})
	@ApiResponse({
		status: 200,
		description: 'Cart after the item was removed',
		type: RemoveCartItemResponseDto,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid item identifier',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 401,
		description: 'Missing, invalid or expired token',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 404,
		description: 'Item not found in the cart',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 500,
		description: 'Checkout service is currently unavailable',
		type: ApiExceptionResponseDto,
	})
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

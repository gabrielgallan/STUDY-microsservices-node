import {
	Body,
	Controller,
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
import { CheckoutDto, CheckoutResponseDto, checkoutSchema } from './dtos/checkout.dto'
import { GetOrderByIdResponseDto } from './dtos/get-order-by-id.dto'
import { ListOrdersResponseDto } from './dtos/list-orders.dto'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Checkout')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersProxyController {
	constructor(private readonly proxyService: ProxyService) {}

	@Post('cart/checkout')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Finish the active cart and create an order' })
	@ApiResponse({
		status: 201,
		description: 'Order created from the active cart',
		type: CheckoutResponseDto,
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
		status: 422,
		description: 'Empty cart or payment method refused by the checkout service',
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
	checkout(
		@Body(new ZodValidationPipe(checkoutSchema)) input: CheckoutDto,
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
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List the orders of the authenticated user' })
	@ApiResponse({
		status: 200,
		description: 'Orders of the authenticated user',
		type: ListOrdersResponseDto,
		isArray: true,
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
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get an order by ID' })
	@ApiParam({
		name: 'id',
		description: 'Identifier of the order',
		example: '6e5d4c3b-2a19-4f87-b6c5-d4e3f2a1b098',
	})
	@ApiResponse({
		status: 200,
		description: 'Order found',
		type: GetOrderByIdResponseDto,
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
		description: 'Order not found',
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

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
import { Public } from '../auth/decorators/public.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ProxyService } from '../proxy/service/proxy.service'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Products')
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get()
	@Public()
	@ApiOperation({ summary: 'List active products' })
	findAllActive() {
		return this.proxyService.proxyRequest('products', 'get', '/products')
	}

	@Get('seller/:sellerId')
	@Public()
	@ApiOperation({ summary: 'List active products from a seller' })
	findActiveBySeller(@Param('sellerId') sellerId: string) {
		return this.proxyService.proxyRequest(
			'products',
			'get',
			`/products/seller/${sellerId}`,
		)
	}

	@Get(':id')
	@Public()
	@ApiOperation({ summary: 'Get a product by ID' })
	findById(@Param('id') id: string) {
		return this.proxyService.proxyRequest('products', 'get', `/products/${id}`)
	}

	@Post()
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Create a product' })
	create(
		@Body() input: Record<string, unknown>,
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'products',
			'post',
			'/products',
			input,
			{ Authorization: authorization },
			request.user,
		)
	}
}

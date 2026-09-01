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
import { Public } from '../auth/decorators/public.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ApiExceptionResponseDto } from '../dtos/api-exeption-response.dto'
import { ZodValidationPipe } from '../pipes/zod-validation.pipe'
import { ProxyService } from '../proxy/service/proxy.service'
import {
	CreateProductDto,
	CreateProductResponseDto,
	createProductSchema,
} from './dtos/create-product.dto'
import { GetProductByIdResponseDto } from './dtos/get-product-by-id.dto'
import { ListActiveProductsResponseDto } from './dtos/list-active-products.dto'
import { ListProductsBySellerResponseDto } from './dtos/list-products-by-seller.dto'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Products')
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get()
	@Public()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List active products' })
	@ApiResponse({
		status: 200,
		description: 'Active products of the catalog',
		type: ListActiveProductsResponseDto,
		isArray: true,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	findAllActive() {
		return this.proxyService.proxyRequest('products', 'get', '/products')
	}

	@Get('seller/:sellerId')
	@Public()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List active products from a seller' })
	@ApiParam({
		name: 'sellerId',
		description: 'Identifier of the seller',
		example: 'a7cd927d-de92-4af8-b16c-797bb1ec1641',
	})
	@ApiResponse({
		status: 200,
		description: 'Active products of the seller',
		type: ListProductsBySellerResponseDto,
		isArray: true,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid seller identifier',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	findActiveBySeller(@Param('sellerId') sellerId: string) {
		return this.proxyService.proxyRequest(
			'products',
			'get',
			`/products/seller/${sellerId}`,
		)
	}

	@Get(':id')
	@Public()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get a product by ID' })
	@ApiParam({
		name: 'id',
		description: 'Identifier of the product',
		example: '3f1a8c22-9d4e-4f0b-8a13-6b7c5e2d1a90',
	})
	@ApiResponse({
		status: 200,
		description: 'Product found',
		type: GetProductByIdResponseDto,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid product identifier',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 404,
		description: 'Product not found',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	findById(@Param('id') id: string) {
		return this.proxyService.proxyRequest('products', 'get', `/products/${id}`)
	}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Create a product' })
	@ApiResponse({
		status: 201,
		description: 'Product created',
		type: CreateProductResponseDto,
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
		status: 403,
		description: 'Only sellers can create products',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 500,
		description: 'Products service is currently unavailable',
		type: ApiExceptionResponseDto,
	})
	create(
		@Body(new ZodValidationPipe(createProductSchema)) input: CreateProductDto,
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

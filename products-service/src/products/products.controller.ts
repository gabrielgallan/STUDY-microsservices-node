import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '../auth/decorators/public.decorator'
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface'
import { UserRole } from '../auth/interfaces/jwt-payload.interface'
import { CreateProductDto } from './dtos/create-product.dto'
import type { Product } from './entities/product.entity'
import { ProductsService } from './products.service'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@Controller('products')
export class ProductsController {
	constructor(private readonly productsService: ProductsService) {}

	@Public()
	@Get()
	findAllActive(): Promise<Product[]> {
		return this.productsService.findAllActive()
	}

	@Public()
	@Get('seller/:sellerId')
	findActiveBySeller(
		@Param('sellerId', new ParseUUIDPipe()) sellerId: string,
	): Promise<Product[]> {
		return this.productsService.findActiveBySeller(sellerId)
	}

	@Public()
	@Get(':id')
	findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<Product> {
		return this.productsService.findById(id)
	}

	@Post()
	create(
		@Body() input: CreateProductDto,
		@Req() request: AuthenticatedRequest,
	): Promise<Product> {
		if (request.user.role !== UserRole.SELLER) {
			throw new ForbiddenException('Apenas vendedores podem criar produtos')
		}

		return this.productsService.create(input, request.user.id)
	}
}

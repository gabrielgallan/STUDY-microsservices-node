import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface'
import { UserRole } from '../auth/interfaces/jwt-payload.interface'
import { CreateProductDto } from './dtos/create-product.dto'
import type { Product } from './entities/product.entity'
import { ProductsService } from './products.service'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@Controller('products')
export class ProductsController {
	constructor(private readonly productsService: ProductsService) {}

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

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateProductInput } from './dtos/create-product.dto'
import { Product } from './entities/product.entity'

@Injectable()
export class ProductsService {
	constructor(
		@InjectRepository(Product)
		private readonly productsRepository: Repository<Product>,
	) {}

	create(input: CreateProductInput, sellerId: string): Promise<Product> {
		const product = this.productsRepository.create({
			...input,
			sellerId,
			isActive: true,
		})

		return this.productsRepository.save(product)
	}

	findAllActive(): Promise<Product[]> {
		return this.productsRepository.find({
			where: { isActive: true },
			order: { createdAt: 'DESC' },
		})
	}

	findActiveBySeller(sellerId: string): Promise<Product[]> {
		return this.productsRepository.findBy({ sellerId, isActive: true })
	}

	async findById(id: string): Promise<Product> {
		const product = await this.productsRepository.findOneBy({ id })

		if (!product) {
			throw new NotFoundException('Produto não encontrado')
		}

		return product
	}
}

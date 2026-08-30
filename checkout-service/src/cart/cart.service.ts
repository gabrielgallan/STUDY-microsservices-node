import {
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
	UnprocessableEntityException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type EntityManager, Repository } from 'typeorm'
import { multiplyMoney, sumMoney } from './cart-money'
import { emptyCartResponse, toCartResponse } from './cart-response.mapper'
import {
	ProductNotFoundError,
	ProductsServiceUnavailableError,
} from './clients/products-client.errors'
import {
	type ExternalProduct,
	ProductsClientService,
} from './clients/products-client.service'
import type { AddCartItemInput } from './dtos/add-cart-item.dto'
import type { CartResponse } from './dtos/cart-response'
import { CartItem } from './entities/cart-item.entity'
import { Cart, CartStatus } from './entities/cart.entity'

@Injectable()
export class CartService {
	constructor(
		@InjectRepository(Cart)
		private readonly cartsRepository: Repository<Cart>,
		private readonly dataSource: DataSource,
		private readonly productsClientService: ProductsClientService,
	) {}

	async getCart(userId: string): Promise<CartResponse> {
		const cart = await this.findActiveCart(this.cartsRepository.manager, userId)

		return cart ? toCartResponse(cart) : emptyCartResponse(userId)
	}

	async addItem(userId: string, input: AddCartItemInput): Promise<CartResponse> {
		const product = await this.fetchProduct(input.productId)

		if (!product.isActive) {
			throw new UnprocessableEntityException('Produto indisponível')
		}

		return this.dataSource.transaction(async (manager) => {
			const cart = await this.findOrCreateActiveCart(manager, userId)
			const existingItem = await manager.findOne(CartItem, {
				where: { cartId: cart.id, productId: product.id },
			})

			if (existingItem) {
				const quantity = existingItem.quantity + input.quantity

				await manager.save(CartItem, {
					...existingItem,
					quantity,
					subtotal: multiplyMoney(existingItem.price, quantity),
				})
			} else {
				await manager.save(
					manager.create(CartItem, {
						cartId: cart.id,
						productId: product.id,
						productName: product.name,
						price: product.price,
						quantity: input.quantity,
						subtotal: multiplyMoney(product.price, input.quantity),
					}),
				)
			}

			return this.saveRecalculatedTotal(manager, cart.id)
		})
	}

	async removeItem(userId: string, itemId: string): Promise<CartResponse> {
		return this.dataSource.transaction(async (manager) => {
			const cart = await this.findActiveCart(manager, userId)

			if (!cart) {
				throw new NotFoundException('Item não encontrado no carrinho')
			}

			const item = await manager.findOne(CartItem, {
				where: { id: itemId, cartId: cart.id },
			})

			if (!item) {
				throw new NotFoundException('Item não encontrado no carrinho')
			}

			await manager.remove(item)

			return this.saveRecalculatedTotal(manager, cart.id)
		})
	}

	private async fetchProduct(productId: string): Promise<ExternalProduct> {
		try {
			return await this.productsClientService.getProduct(productId)
		} catch (error) {
			if (error instanceof ProductNotFoundError) {
				throw new NotFoundException('Produto não encontrado')
			}

			if (error instanceof ProductsServiceUnavailableError) {
				throw new ServiceUnavailableException(
					'Serviço de produtos indisponível no momento',
				)
			}

			throw error
		}
	}

	private findActiveCart(
		manager: EntityManager,
		userId: string,
	): Promise<Cart | null> {
		return manager.findOne(Cart, {
			where: { userId, status: CartStatus.ACTIVE },
		})
	}

	private async findOrCreateActiveCart(
		manager: EntityManager,
		userId: string,
	): Promise<Cart> {
		const cart = await this.findActiveCart(manager, userId)

		if (cart) {
			return cart
		}

		return manager.save(
			manager.create(Cart, {
				userId,
				status: CartStatus.ACTIVE,
				total: 0,
			}),
		)
	}

	/**
	 * The total is always rebuilt from the persisted items, never incremented,
	 * so it can not drift away from the cart contents.
	 */
	private async saveRecalculatedTotal(
		manager: EntityManager,
		cartId: string,
	): Promise<CartResponse> {
		const items = await manager.find(CartItem, { where: { cartId } })

		await manager.update(Cart, cartId, {
			total: sumMoney(items.map((item) => item.subtotal)),
		})

		const cart = await manager.findOneOrFail(Cart, { where: { id: cartId } })

		return toCartResponse(cart)
	}
}

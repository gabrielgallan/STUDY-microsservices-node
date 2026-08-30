import {
	Injectable,
	Logger,
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { toMoney } from '../cart/cart-money'
import { Cart, CartStatus } from '../cart/entities/cart.entity'
import { toPaymentOrderMessage } from '../events/payment-queue/payment-order-message.mapper'
import { PaymentsQueueService } from '../events/payment-queue/payments-queue.service'
import type { CheckoutInput } from './dtos/checkout.dto'
import type { OrderResponse } from './dtos/order-response'
import { Order, OrderStatus } from './entities/order.entity'
import { toOrderResponse } from './order-response.mapper'

@Injectable()
export class OrdersService {
	private readonly logger = new Logger(OrdersService.name)

	constructor(
		@InjectRepository(Order)
		private readonly ordersRepository: Repository<Order>,
		private readonly dataSource: DataSource,
		private readonly paymentsQueueService: PaymentsQueueService,
	) {}

	async checkout(userId: string, input: CheckoutInput): Promise<OrderResponse> {
		const { order, cart } = await this.createOrderFromActiveCart(userId, input)

		await this.publishPaymentOrder(order, cart)

		return toOrderResponse(order)
	}

	async findAllByUser(userId: string): Promise<OrderResponse[]> {
		const orders = await this.ordersRepository.find({
			where: { userId },
			order: { createdAt: 'DESC' },
		})

		return orders.map(toOrderResponse)
	}

	async findByIdForUser(userId: string, id: string): Promise<OrderResponse> {
		const order = await this.ordersRepository.findOneBy({ id, userId })

		if (!order) {
			throw new NotFoundException('Pedido não encontrado')
		}

		return toOrderResponse(order)
	}

	private createOrderFromActiveCart(
		userId: string,
		input: CheckoutInput,
	): Promise<{ order: Order; cart: Cart }> {
		return this.dataSource.transaction(async (manager) => {
			const cart = await manager.findOne(Cart, {
				where: { userId, status: CartStatus.ACTIVE },
			})

			if (!cart || cart.items.length === 0) {
				throw new UnprocessableEntityException(
					'Não é possível finalizar um carrinho vazio',
				)
			}

			/**
			 * Conditioning the transition on the cart still being active is what
			 * keeps two concurrent checkouts from producing two orders: the second
			 * update only runs after the first commits and then matches no row.
			 */
			const transition = await manager.update(
				Cart,
				{ id: cart.id, status: CartStatus.ACTIVE },
				{ status: CartStatus.COMPLETED },
			)

			if (transition.affected !== 1) {
				throw new UnprocessableEntityException(
					'Não é possível finalizar um carrinho vazio',
				)
			}

			const order = await manager.save(
				manager.create(Order, {
					userId,
					cartId: cart.id,
					total: toMoney(cart.total),
					paymentMethod: input.paymentMethod,
					status: OrderStatus.PENDING,
				}),
			)

			return { order, cart }
		})
	}

	/**
	 * Published only after the order is committed: a message for an order that
	 * was rolled back would make the payments-service charge for nothing. The
	 * order already exists at this point, so a failure here is logged and the
	 * request still succeeds, leaving the order pending.
	 */
	private async publishPaymentOrder(order: Order, cart: Cart): Promise<void> {
		try {
			await this.paymentsQueueService.publishPaymentOrder(
				toPaymentOrderMessage(order, cart),
			)
		} catch (error) {
			this.logger.error(
				`Failed to publish the payment order for order ${order.id}`,
				error instanceof Error ? error.stack : undefined,
			)
		}
	}
}

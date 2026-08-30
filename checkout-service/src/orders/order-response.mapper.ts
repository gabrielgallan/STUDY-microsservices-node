import { toMoney } from '../cart/cart-money'
import type { OrderResponse } from './dtos/order-response'
import type { Order } from './entities/order.entity'

export const toOrderResponse = (order: Order): OrderResponse => ({
	id: order.id,
	userId: order.userId,
	cartId: order.cartId,
	total: toMoney(order.total),
	status: order.status,
	paymentMethod: order.paymentMethod,
	createdAt: order.createdAt,
	updatedAt: order.updatedAt,
})

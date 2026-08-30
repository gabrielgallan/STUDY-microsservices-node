import type { Cart } from '../../cart/entities/cart.entity'
import type { Order } from '../../orders/entities/order.entity'
import type { PaymentOrderMessage } from './payment-queue.interface'

export const toPaymentOrderMessage = (
	order: Order,
	cart: Cart,
): PaymentOrderMessage => ({
	orderId: order.id,
	userId: order.userId,
	amount: Number(order.total),
	items: cart.items.map((item) => ({
		productId: item.productId,
		quantity: item.quantity,
		price: Number(item.price),
	})),
	paymentMethod: order.paymentMethod,
	createdAt: order.createdAt.toISOString(),
})

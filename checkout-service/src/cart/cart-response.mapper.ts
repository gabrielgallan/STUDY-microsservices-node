import { toMoney } from './cart-money'
import type { CartResponse } from './dtos/cart-response'
import type { CartItem } from './entities/cart-item.entity'
import { type Cart, CartStatus } from './entities/cart.entity'

/**
 * Fields are copied one by one on purpose: it keeps `cartId`, the loaded `cart`
 * relation and any other persistence detail out of the HTTP response.
 */
export const toCartResponse = (cart: Cart): CartResponse => ({
	id: cart.id,
	userId: cart.userId,
	status: cart.status,
	items: (cart.items ?? []).map((item: CartItem) => ({
		id: item.id,
		productId: item.productId,
		productName: item.productName,
		price: toMoney(item.price),
		quantity: item.quantity,
		subtotal: toMoney(item.subtotal),
	})),
	total: toMoney(cart.total),
	createdAt: cart.createdAt,
	updatedAt: cart.updatedAt,
})

export const emptyCartResponse = (userId: string): CartResponse => ({
	id: null,
	userId,
	status: CartStatus.ACTIVE,
	items: [],
	total: 0,
	createdAt: null,
	updatedAt: null,
})

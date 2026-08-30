import type { OrderStatus } from '../entities/order.entity'

export interface OrderResponse {
	id: string
	userId: string
	cartId: string
	total: number
	status: OrderStatus
	paymentMethod: string
	createdAt: Date
	updatedAt: Date
}

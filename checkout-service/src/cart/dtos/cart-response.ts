import type { CartStatus } from '../entities/cart.entity'

export interface CartItemResponse {
	id: string
	productId: string
	productName: string
	price: number
	quantity: number
	subtotal: number
}

export interface CartResponse {
	id: string | null
	userId: string
	status: CartStatus
	items: CartItemResponse[]
	total: number
	createdAt: Date | null
	updatedAt: Date | null
}

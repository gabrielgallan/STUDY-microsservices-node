import {
	Column,
	CreateDateColumn,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm'
import { CartItem } from './cart-item.entity'

export enum CartStatus {
	ACTIVE = 'active',
	COMPLETED = 'completed',
	ABANDONED = 'abandoned',
}

@Entity({ name: 'carts' })
export class Cart {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'uuid' })
	userId!: string

	@Column({ type: 'enum', enum: CartStatus, default: CartStatus.ACTIVE })
	status!: CartStatus

	@Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
	total!: number

	@OneToMany(() => CartItem, (item) => item.cart, {
		cascade: true,
		eager: true,
	})
	items!: CartItem[]

	@CreateDateColumn({ type: 'timestamp' })
	createdAt!: Date

	@UpdateDateColumn({ type: 'timestamp' })
	updatedAt!: Date
}

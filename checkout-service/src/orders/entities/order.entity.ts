import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm'

export enum OrderStatus {
	PENDING = 'pending',
	PAID = 'paid',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
}

@Entity({ name: 'orders' })
export class Order {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'uuid' })
	userId!: string

	@Column({ type: 'uuid' })
	cartId!: string

	@Column({ type: 'decimal', precision: 10, scale: 2 })
	total!: number

	@Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
	status!: OrderStatus

	@Column({ type: 'varchar', length: 50 })
	paymentMethod!: string

	@CreateDateColumn({ type: 'timestamp' })
	createdAt!: Date

	@UpdateDateColumn({ type: 'timestamp' })
	updatedAt!: Date
}

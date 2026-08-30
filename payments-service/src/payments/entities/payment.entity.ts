import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm'

export enum PaymentStatus {
	PENDING = 'pending',
	APPROVED = 'approved',
	REJECTED = 'rejected',
}

@Entity({ name: 'payments' })
export class Payment {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	/** Unique: a given order is never charged twice, even on a redelivery. */
	@Column({ type: 'uuid', unique: true })
	orderId!: string

	@Column({ type: 'uuid' })
	userId!: string

	@Column({ type: 'decimal', precision: 10, scale: 2 })
	amount!: number

	@Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
	status!: PaymentStatus

	@Column({ type: 'varchar', length: 50 })
	paymentMethod!: string

	@Column({ type: 'varchar', length: 255, nullable: true })
	transactionId!: string | null

	@Column({ type: 'varchar', length: 255, nullable: true })
	rejectionReason!: string | null

	@Column({ type: 'timestamp', nullable: true })
	processedAt!: Date | null

	@CreateDateColumn({ type: 'timestamp' })
	createdAt!: Date

	@UpdateDateColumn({ type: 'timestamp' })
	updatedAt!: Date
}

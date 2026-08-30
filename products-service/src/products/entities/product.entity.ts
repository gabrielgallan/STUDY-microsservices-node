import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm'

@Entity({ name: 'products' })
export class Product {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'varchar', length: 255 })
	name!: string

	@Column({ type: 'text' })
	description!: string

	@Column({ type: 'decimal', precision: 10, scale: 2 })
	price!: number

	@Column({ type: 'int', default: 0 })
	stock!: number

	@Column({ type: 'uuid' })
	sellerId!: string

	@Column({ type: 'boolean', default: true })
	isActive!: boolean

	@CreateDateColumn({ type: 'timestamp' })
	createdAt!: Date

	@UpdateDateColumn({ type: 'timestamp' })
	updatedAt!: Date
}

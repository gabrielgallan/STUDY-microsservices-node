import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm'

export enum UserRole {
	SELLER = 'seller',
	BUYER = 'buyer',
}

export enum UserStatus {
	ACTIVE = 'active',
	INACTIVE = 'inactive',
}

@Entity({ name: 'users' })
export class User {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ unique: true })
	email!: string

	@Column()
	password!: string

	@Column()
	firstName!: string

	@Column()
	lastName!: string

	@Column({ type: 'enum', enum: UserRole })
	role!: UserRole

	@Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
	status!: UserStatus

	@CreateDateColumn({ type: 'timestamp' })
	createdAt!: Date

	@UpdateDateColumn({ type: 'timestamp' })
	updatedAt!: Date
}

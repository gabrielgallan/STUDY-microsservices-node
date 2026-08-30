import type { UserRole, UserStatus } from '../entities/user.entity'

export interface PublicUser {
	id: string
	email: string
	firstName: string
	lastName: string
	role: UserRole
	status: UserStatus
	createdAt: Date
	updatedAt: Date
}

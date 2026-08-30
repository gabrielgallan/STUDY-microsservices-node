import type { UserRole, UserStatus } from '../../users/entities/user.entity'

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

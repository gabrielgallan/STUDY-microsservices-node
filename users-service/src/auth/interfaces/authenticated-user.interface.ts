import type { UserRole } from '../../users/entities/user.entity'

export interface AuthenticatedUser {
	id: string
	email: string
	role: UserRole
}

import type { UserRole } from './jwt-payload.interface'

export interface AuthenticatedUser {
	id: string
	email: string
	role: UserRole
}

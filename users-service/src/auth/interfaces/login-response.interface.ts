import type { PublicUser } from '../../users/interfaces/public-user.interface'

export interface LoginResponse {
	user: PublicUser
	token: string
}

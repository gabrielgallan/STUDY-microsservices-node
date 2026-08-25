import { HttpService } from '@nestjs/axios'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { firstValueFrom } from 'rxjs/internal/firstValueFrom'
import { serviceConfig } from '../../config/gateway.config'

export interface UserSession {
	valid: boolean
	user: {
		id: string
		email: string
		role: string
		firstName: string
		lastName: string
		status: string
	} | null
}

@Injectable()
export class AuthService {
	constructor(
		private jwtService: JwtService,
		private httpService: HttpService,
	) {}

	async validateJwtToken(token: string): Promise<any> {
		try {
			return this.jwtService.verify(token)
		} catch {
			throw new UnauthorizedException('Invalid token')
		}
	}

	async validateSessionToken(sessionToken: string): Promise<UserSession> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.get(
					`${serviceConfig.users.url}/sessions/validate/${sessionToken}`,
					{
						timeout: serviceConfig.users.timeout,
					},
				),
			)

			return data
		} catch {
			throw new UnauthorizedException('Invalid session token')
		}
	}
	async login() {}
	async register() {}
}

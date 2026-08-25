import { UnauthorizedException } from '@nestjs/common'
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import z from 'zod'
import { EnvService } from '../../env/env.service'
import { AuthService } from '../services/auth.service'

const payloadSchema = z.object({
	userId: z.uuid(),
	email: z.email(),
	role: z.string(),
})

export type UserPayload = z.infer<typeof payloadSchema>

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private authService: AuthService,
		private env: EnvService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: env.get('JWT_SECRET'),
		})
	}

	async validate(payload: UserPayload) {
		if (!payload) {
			throw new UnauthorizedException('Invalid token payload')
		}

		const { user } = await this.authService.validateJwtToken(payload)

		if (!user) {
			throw new UnauthorizedException('User not found')
		}

		return { userId: user.id, email: user.email, role: user.role }
	}
}

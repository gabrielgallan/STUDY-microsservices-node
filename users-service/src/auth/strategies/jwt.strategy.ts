import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { EnvService } from '../../env/env.service'
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface'
import { jwtPayloadSchema } from '../interfaces/jwt-payload.interface'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(envService: EnvService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: envService.get('JWT_SECRET'),
		})
	}

	validate(payload: unknown): AuthenticatedUser {
		const result = jwtPayloadSchema.safeParse(payload)

		if (!result.success) {
			throw new UnauthorizedException()
		}

		return {
			id: result.data.sub,
			email: result.data.email,
			role: result.data.role,
		}
	}
}

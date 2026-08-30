import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { EnvService } from '../../env/env.service'
import { type JwtPayload, jwtPayloadSchema } from '../interfaces/jwt-payload.interface'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(envService: EnvService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: envService.get('JWT_SECRET'),
		})
	}

	validate(payload: unknown): JwtPayload {
		const result = jwtPayloadSchema.safeParse(payload)

		if (!result.success) {
			throw new UnauthorizedException()
		}

		return result.data
	}
}

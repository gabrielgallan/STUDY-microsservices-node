import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { Request } from 'express'
import z from 'zod'
import { EnvService } from '../../env/env.service'
import { AuthService } from '../services/auth.service'

const jwtPayloadSchema = z.object({
	sub: z.uuid(),
	email: z.email(),
	role: z.enum(['seller', 'buyer']),
})

const userPayloadSchema = z.object({
	userId: z.uuid(),
	email: z.email(),
	role: z.enum(['seller', 'buyer']),
})

export type UserPayload = z.infer<typeof userPayloadSchema>

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
			passReqToCallback: true,
		})
	}

	async validate(request: Request, payload: unknown): Promise<UserPayload> {
		const parsedPayload = jwtPayloadSchema.safeParse(payload)
		const authorization = request.headers.authorization

		if (!parsedPayload.success || !authorization) {
			throw new UnauthorizedException('Invalid token payload')
		}

		const identity = await this.authService.validateJwtToken(authorization)
		const parsedIdentity = userPayloadSchema.safeParse(identity)

		if (!parsedIdentity.success) {
			throw new UnauthorizedException('User not found')
		}

		return parsedIdentity.data
	}
}

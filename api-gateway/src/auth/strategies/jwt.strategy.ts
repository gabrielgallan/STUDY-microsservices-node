import { UnauthorizedException } from '@nestjs/common'
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { EnvService } from '../../env/env.service'
import { AuthService } from '../services/auth.service'

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

	async validate(payload: any) {
		if (!payload) {
			throw new UnauthorizedException('Invalid token payload')
		}

		const user = await this.authService.validateJwtToken(payload)

		if (!user) {
			throw new UnauthorizedException('User not found')
		}

		return { userId: user.sub, email: user.email, role: user.role }
	}
}

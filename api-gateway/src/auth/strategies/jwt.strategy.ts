import { UnauthorizedException } from '@nestjs/common'
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator'
import { ConfigService } from '@nestjs/config/dist/config.service'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthService } from '../services/auth.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private authService: AuthService,
		private configService: ConfigService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.get<string>('JWT_SECRET') ?? 'secret',
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

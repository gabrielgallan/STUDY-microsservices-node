import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { EnvModule } from '../env/env.module'
import { EnvService } from '../env/env.service'
import { UsersModule } from '../users/users.module'
import { AuthController } from './controllers/auth.controller'
import { AuthService } from './services/auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
	imports: [
		UsersModule,
		EnvModule,
		PassportModule,
		JwtModule.registerAsync({
			imports: [EnvModule],
			inject: [EnvService],
			useFactory: (envService: EnvService) => ({
				secret: envService.get('JWT_SECRET'),
				signOptions: { expiresIn: '24h' },
			}),
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, JwtStrategy],
})
export class AuthModule {}

import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt/dist/jwt.module'
import { PassportModule } from '@nestjs/passport'
import { EnvModule } from '../env/env.module'
import { EnvService } from '../env/env.service'
import { AuthController } from './controllers/auth.controller'
import { AuthService } from './services/auth.service'

@Module({
	imports: [
		EnvModule,
		HttpModule,
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.registerAsync({
			imports: [EnvModule],
			useFactory: async (env: EnvService) => ({
				secret: env.get('JWT_SECRET'),
				signOptions: { expiresIn: '24h' },
			}),
			inject: [EnvService],
		}),
	],
	controllers: [AuthController],
	providers: [AuthService],
})
export class AuthModule {}

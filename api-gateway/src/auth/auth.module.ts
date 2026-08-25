import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config/dist/config.module'
import { ConfigService } from '@nestjs/config/dist/config.service'
import { JwtModule } from '@nestjs/jwt/dist/jwt.module'
import { PassportModule } from '@nestjs/passport'
import { AuthService } from './service/auth.service'

@Module({
	imports: [
		HttpModule,
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				secret: configService.get('JWT_SECRET'),
				signOptions: { expiresIn: '24h' },
			}),
			inject: [ConfigService],
		}),
	],
	providers: [AuthService],
})
export class AuthModule {}

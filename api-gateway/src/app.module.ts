import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { CheckoutModule } from './checkout/checkout.module'
import { HealthModule } from './controllers/health.module'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { EnvService } from './env/env.service'
import { CustomThrottlerGuard } from './guards/throttler.guard'
import { LoggingMiddleware } from './middleware/logging/logging.middleware'
import { MiddlewareModule } from './middleware/middleware.module'
import { GatewayProductsModule } from './products/products.module'
import { ProxyModule } from './proxy/proxy.module'
import { GatewayUsersModule } from './users/users.module'

@Module({
	imports: [
		EnvModule,
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (env) => envSchema.parse(env),
		}),
		ThrottlerModule.forRootAsync({
			imports: [EnvModule],
			useFactory: (env: EnvService) => [
				{
					name: 'short',
					ttl: 1000, // 1 second
					limit: Number(env.get('RATE_LIMIT_SHORT')),
				},
				{
					name: 'medium',
					ttl: 60000, // 1 minute
					limit: Number(env.get('RATE_LIMIT_MEDIUM')),
				},
				{
					name: 'long',
					ttl: 900000, // 15 minutes
					limit: Number(env.get('RATE_LIMIT_LONG')),
				},
			],
			inject: [EnvService],
		}),
		AuthModule,
		GatewayUsersModule,
		GatewayProductsModule,
		CheckoutModule,
		ProxyModule,
		MiddlewareModule,
		HealthModule,
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: CustomThrottlerGuard,
		},
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer.apply(LoggingMiddleware).forRoutes('*')
	}
}

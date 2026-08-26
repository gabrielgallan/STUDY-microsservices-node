import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { CircuitBreakerModule } from './common/circuit-breaker/circuit-breaker.module'
import { FallbackModule } from './common/fallback/fallback.module'
import { HealthCheckModule } from './common/health/health-check.module'
import { HealthModule } from './controllers/health.module'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { EnvService } from './env/env.service'
import { CustomThrottlerGuard } from './guards/throttler.guard'
import { LoggingMiddleware } from './middleware/logging/logging.middleware'
import { MiddlewareModule } from './middleware/middleware.module'
import { ProxyModule } from './proxy/proxy.module'

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
		ProxyModule,
		MiddlewareModule,
		HealthModule,
		HealthCheckModule,
		FallbackModule,
		CircuitBreakerModule,
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

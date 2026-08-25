import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { HealthController } from './controllers/health.controller'
import { CustomThrottlerGuard } from './guards/throttler.guard'
import { LoggingMiddleware } from './middleware/logging/logging.middleware'
import { MiddlewareModule } from './middleware/middleware.module'
import { ProxyModule } from './proxy/proxy.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		ThrottlerModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: (configService: ConfigService) => [
				{
					name: 'short',
					ttl: 1000, // 1 second
					limit: configService.get<number>('RATE_LIMIT_SHORT') || 10,
				},
				{
					name: 'medium',
					ttl: 60000, // 1 minute
					limit: configService.get<number>('RATE_LIMIT_MEDIUM') || 100,
				},
				{
					name: 'long',
					ttl: 900000, // 15 minutes
					limit: configService.get<number>('RATE_LIMIT_LONG') || 1000,
				},
			],
			inject: [ConfigService],
		}),
		AuthModule,
		ProxyModule,
		MiddlewareModule,
	],
	controllers: [HealthController],
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

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_PIPE } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ZodValidationPipe } from 'nestjs-zod'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { CartModule } from './cart/cart.module'
import { databaseConfig } from './config/database.config'
import { TestController } from './controllers/test.controller'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { EventsModule } from './events/events.module'
import { HealthModule } from './health/health.module'
import { OrdersModule } from './orders/orders.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (env) => envSchema.parse(env),
		}),
		TypeOrmModule.forRoot(databaseConfig),
		EnvModule,
		EventsModule,
		CartModule,
		OrdersModule,
		AuthModule,
		HealthModule,
	],
	controllers: [TestController],
	providers: [
		{
			provide: APP_GUARD,
			useClass: JwtAuthGuard,
		},
		{
			provide: APP_PIPE,
			useClass: ZodValidationPipe,
		},
	],
})
export class AppModule {}

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { databaseConfig } from './db/database.config'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { EventsModule } from './events/events.module'
import { HealthModule } from './health/health.module'
import { PaymentsModule } from './payments/payments.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (env) => envSchema.parse(env),
		}),
		TypeOrmModule.forRoot(databaseConfig),
		EnvModule,
		PaymentsModule,
		EventsModule,
		HealthModule,
	],
	controllers: [],
	providers: [],
})
export class AppModule {}

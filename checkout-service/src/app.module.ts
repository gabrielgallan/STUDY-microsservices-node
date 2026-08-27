import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config/dist/config.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { databaseConfig } from './config/database.config'
import { TestController } from './controllers/test.controller'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { EventsModule } from './events/events.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (env) => envSchema.parse(env),
		}),
		TypeOrmModule.forRoot(databaseConfig),
		EnvModule,
		EventsModule,
	],
	controllers: [TestController],
	providers: [],
})
export class AppModule {}

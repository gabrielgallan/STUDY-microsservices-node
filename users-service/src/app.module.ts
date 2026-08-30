import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from './auth/auth.module'
import { databaseConfig } from './config/database.config'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { UsersModule } from './users/users.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (environment) => envSchema.parse(environment),
		}),
		TypeOrmModule.forRoot(databaseConfig),
		EnvModule,
		UsersModule,
		AuthModule,
	],
	controllers: [],
	providers: [],
})
export class AppModule {}

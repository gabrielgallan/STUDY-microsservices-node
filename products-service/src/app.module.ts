import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { databaseConfig } from './config/database.config'
import { envSchema } from './env/env'
import { EnvModule } from './env/env.module'
import { ProductsModule } from './products/products.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (environment) => envSchema.parse(environment),
		}),
		TypeOrmModule.forRoot(databaseConfig),
		EnvModule,
		ProductsModule,
	],
	controllers: [],
	providers: [],
})
export class AppModule {}

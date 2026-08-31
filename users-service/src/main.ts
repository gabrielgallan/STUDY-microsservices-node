import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureSwagger } from './config/swagger.config'
import { EnvService } from './env/env.service'

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'warn', 'log', 'verbose', 'debug'],
		cors: true,
	})

	const logger = new Logger('Main')

	const env = app.get(EnvService)

	configureSwagger(app)

	const port = env.get('PORT')

	app
		.listen(port)
		.catch((error) => {
			logger.error('Error starting HTTP server', error)

			process.exit(1)
		})
		.finally(() => {
			logger.log(`HTTP server running on http://localhost:${port}`)
			logger.log(`API documentation can be found on http://localhost:${port}/api`)
		})
}
bootstrap()

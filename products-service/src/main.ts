import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import { AppModule } from './app.module'
import { EnvService } from './env/env.service'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	app.useGlobalPipes(new ZodValidationPipe())

	const env = app.get(EnvService)
	const logger = new Logger('Main')
	const port = env.get('PORT')

	try {
		await app.listen(port)
		logger.log(`HTTP server running on http://localhost:${port}`)
	} catch (error) {
		logger.error('Error starting HTTP server', error)
		process.exit(1)
	}
}
bootstrap()

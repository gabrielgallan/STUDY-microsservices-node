import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { configureSwagger } from './config/swagger.config'
import { EnvService } from './env/env.service'

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'log', 'warn', 'verbose', 'debug'],
	})

	const env = app.get(EnvService)

	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
					styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
				},
			},
			crossOriginEmbedderPolicy: false,
			hsts: {
				maxAge: 31536000,
				includeSubDomains: true,
				preload: true,
			},
		}),
	)

	app.enableCors({
		origin: (origin: string, callback: any) => {
			if (!origin) return callback(null, true)

			const allowedOrigins = env.get('CORS_ORIGINS').split(',')

			if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
				callback(null, true)
			} else {
				callback(new Error('Not allowed by CORS'))
			}
		},
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: [
			'Content-Type',
			'Authorization',
			'X-Requested-With',
			'Accept',
			'Origin',
			'Access-Control-Request-Method',
			'Access-Control-Request-Headers',
		],
		credentials: true,
		maxAge: 86400,
	})

	configureSwagger(app)

	const logger = new Logger('Main')

	const port = env.get('PORT')

	app
		.listen(port)
		.catch((error) => {
			logger.error('Error starting HTTP server', error)

			process.exit(1)
		})
		.finally(() => {
			logger.log(`HTTP server running on http://localhost:${port}`)
			logger.log(`API reference can be found on http://localhost:${port}/reference`)
		})
}
bootstrap()

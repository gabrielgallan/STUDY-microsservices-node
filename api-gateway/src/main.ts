import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'log', 'warn', 'verbose', 'debug'],
	})

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
		origin: (origin: any, callback: any) => {
			if (!origin) return callback(null, true)

			const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['*']

			if (allowedOrigins.includes(origin)) {
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

	const config = new DocumentBuilder()
		.setTitle('task_manager API')
		.setVersion('1.0')
		.build()

	const document = SwaggerModule.createDocument(app, config)

	const httpAdapter = app.getHttpAdapter()

	httpAdapter.get('/reference/openapi.json', (_req, res) => {
		res.json(document)
	})

	app.use(
		'/reference',
		apiReference({
			url: '/reference/openapi.json',
			theme: 'elysiajs',
			layout: 'modern',
		}),
	)

	const logger = new Logger('Main')

	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	)

	const port = process.env.PORT || 3000

	app
		.listen(port)
		.catch((error) => {
			logger.error('Error starting HTTP server', error)

			process.exit(1)
		})
		.finally(() => {
			logger.verbose(`HTTP server running on port ${port}`)
			logger.verbose(`API documentation can be found on /reference`)
			logger.verbose(`API openapi.json can be found on /reference/openapi.json`)
		})
}
bootstrap()

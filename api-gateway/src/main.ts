import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'
import helmet from 'helmet'
import { AppModule } from './app.module'
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
		.setTitle('Marketplace API Gateway')
		.setDescription('API Gateway for the Marketplace microservices architecture')
		.setVersion('1.0')
		.setLicense('MIT', 'https://opensource.org/licenses/MIT')
		.addBearerAuth({
			type: 'http',
			scheme: 'bearer',
			bearerFormat: 'JWT',
			name: 'JWT',
			description: 'Enter JWT token',
			in: 'header',
		})
		.addApiKey({
			type: 'apiKey',
			name: 'x-session-token',
			in: 'header',
			description: 'Enter session token',
		})
		.addTag('Authentication', 'Operations related to authentication')
		.addTag('Users', 'Operations related to users')
		.addTag('Products', 'Operations related to products')
		.addTag('Checkout', 'Operations related to checkout')
		.addTag('Payments', 'Operations related to payments')
		.build()

	const document = SwaggerModule.createDocument(app, config)

	const httpAdapter = app.getHttpAdapter()

	httpAdapter.get('/reference/openapi.json', (_, res) => {
		res.json(document)
	})

	app.use(
		'/reference',
		apiReference({
			title: 'Marketplace API Gateway',
			url: '/reference/openapi.json',
			theme: 'elysiajs',
			layout: 'classic',
			darkMode: true,
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

	const port = env.get('PORT')

	app
		.listen(port)
		.catch((error) => {
			logger.error('Error starting HTTP server', error)

			process.exit(1)
		})
		.finally(() => {
			logger.log(`HTTP server running on port ${port}`)
			logger.log(`API reference can be found on /reference`)
			logger.log(`API openapi.json can be found on /reference/openapi.json`)
		})
}
bootstrap()

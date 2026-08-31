import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'

export const configureSwagger = (app: INestApplication): void => {
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

	app.use(
		'/reference',
		apiReference({
			content: document,
			theme: 'elysiajs',
			layout: 'classic',
		}),
	)
}

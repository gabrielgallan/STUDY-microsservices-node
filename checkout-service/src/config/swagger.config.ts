import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'

export const configureSwagger = (app: INestApplication): void => {
	const config = new DocumentBuilder()
		.setTitle('Checkout Service')
		.setVersion('1.0')
		.addBearerAuth(
			{
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
			},
			'bearer',
		)
		.build()

	const document = SwaggerModule.createDocument(app, config)

	app.use(
		'/api',
		apiReference({
			content: document,
			theme: 'elysiajs',
			layout: 'classic',
		}),
	)
}

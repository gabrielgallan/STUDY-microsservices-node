import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export const configureSwagger = (app: INestApplication): void => {
	const config = new DocumentBuilder()
		.setTitle('Products Service')
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

	SwaggerModule.setup('api', app, document)
}

import 'dotenv/config'
import z from 'zod'

export const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
	PORT: z.coerce.number().default(3004),

	DATABASE_URL: z.url().default('postgresql://docker:docker@localhost:5434/payments'),

	JWT_SECRET: z.string(),

	USERS_SERVICE_URL: z.url().default('http://localhost:3001'),
	PRODUCTS_SERVICE_URL: z.url().default('http://localhost:3002'),
	CHECKOUT_SERVICE_URL: z.url().default('http://localhost:3003'),

	RABBITMQ_URL: z.string().default('amqp://admin:admin@localhost:5672'),
	RABBITMQ_QUEUE_PAYMENTS: z.string().default('payment_queue'),
	RABBITMQ_EXCHANGE: z.string().default('payments'),

	PAYMENT_GATEWAY_URL: z.url(),
	PAYMENT_GATEWAY_API_KEY: z.string(),
})

type Env = z.infer<typeof envSchema>

const _env = envSchema.safeParse(process.env)

if (_env.success === false) {
	const errors = _env.error.format()
	console.error('Invalid enviroment variable!', errors)

	process.exit(1)
}

const env = _env.data

export { type Env, env }

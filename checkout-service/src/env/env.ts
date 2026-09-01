import 'dotenv/config'
import z from 'zod'

const nonEmptyStringSchema = z.string().trim().min(1)

export const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
	PORT: z.coerce.number().default(3003),

	DATABASE_URL: z.url().default('postgresql://docker:docker@localhost:5433/checkout'),

	JWT_SECRET: nonEmptyStringSchema,

	USERS_SERVICE_URL: z.url().default('http://localhost:3001'),
	PRODUCTS_SERVICE_URL: z.url().default('http://localhost:3002'),
	PAYMENTS_SERVICE_URL: z.url().default('http://localhost:3004'),

	RABBITMQ_URL: z.string().default('amqp://admin:admin@localhost:5672'),
	RABBITMQ_QUEUE_PAYMENTS: z.string().default('payment_queue'),
	RABBITMQ_EXCHANGE: z.string().default('payments'),
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

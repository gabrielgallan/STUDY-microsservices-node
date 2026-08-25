import 'dotenv/config'
import z from 'zod'

export const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
	PORT: z.coerce.number().default(3005),

	JWT_SECRET: z.string().default('your-secret-key'),

	USERS_SERVICE_URL: z.url().default('http://localhost:3001'),
	PRODUCTS_SERVICE_URL: z.url().default('http://localhost:3002'),
	CHECKOUT_SERVICE_URL: z.url().default('http://localhost:3003'),
	PAYMENTS_SERVICE_URL: z.url().default('http://localhost:3004'),

	CORS_ORIGINS: z.string().default('*'),

	RATE_LIMIT_SHORT: z.coerce.number().default(10),
	RATE_LIMIT_MEDIUM: z.coerce.number().default(100),
	RATE_LIMIT_LONG: z.coerce.number().default(1000),
})

export type Env = z.infer<typeof envSchema>

import 'dotenv/config'
import z from 'zod'

const portSchema = z.coerce.number().int().min(1).max(65535)
const nonEmptyStringSchema = z.string().trim().min(1)

export const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
	PORT: portSchema.default(3002),

	DATABASE_URL: z.url().default('postgresql://docker:docker@localhost:5436/products'),

	JWT_SECRET: nonEmptyStringSchema,
})

export type Env = z.infer<typeof envSchema>

const parsedEnv = envSchema.safeParse(process.env)

if (parsedEnv.success === false) {
	console.error('Invalid environment variable!', parsedEnv.error.format())
	process.exit(1)
}

export const env = parsedEnv.data

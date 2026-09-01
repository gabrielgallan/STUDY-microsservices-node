import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

export class ZodValidationPipe implements PipeTransform {
	constructor(private readonly schema: ZodType) {}

	transform(value: unknown) {
		const result = this.schema.safeParse(value)

		if (!result.success) {
			throw new BadRequestException({
				message: 'Data validation failed',
				error: result.error.flatten(),
				statusCode: 400,
			})
		}

		return result.data
	}
}

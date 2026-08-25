import { Injectable } from '@nestjs/common'
import { ThrottlerRequest } from '@nestjs/throttler'
import { ThrottlerException } from '@nestjs/throttler/dist/throttler.exception'
import { ThrottlerGuard } from '@nestjs/throttler/dist/throttler.guard'

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		return Promise.resolve(`${req.ip}-${req.headers['user-agent']}`)
	}

	protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
		const { context, ttl, limit } = requestProps

		const { req, res } = this.getRequestResponse(context)

		const thotttlerName = 'throttler'

		const tracker = await this.getTracker(req)

		const key = this.generateKey(context, tracker, 'throttler')

		const totalHits = await this.storageService.increment(
			key,
			ttl,
			limit,
			1,
			thotttlerName,
		)

		if (Number(totalHits) > limit) {
			res.setHeader('Retry-After', ttl)

			throw new ThrottlerException('Too many requests. Please try again later.')
		}

		res.setHeader('X-RateLimit-Limit', limit)
		res.setHeader('X-RateLimit-Remaining', Math.max(limit - Number(totalHits), 0))
		res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + ttl)

		return true
	}
}

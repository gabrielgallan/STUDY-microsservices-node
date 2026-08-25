import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler/dist/throttler.guard'

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		// Use the user ID as the tracker if available, otherwise fallback to IP address
		return Promise.resolve(`${req.ip}-${req.headers['user-agent']}`)
	}
}

import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { Request, Response } from 'express'

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
	private logger = new Logger('HTTP')

	use(req: Request, res: Response, next: () => void) {
		const { method, originalUrl, ip } = req
		const userAgent = req.get('user-agent') || ''
		const startTime = Date.now()

		this.logger.log(
			`Incoming Request: ${method} ${originalUrl} - IP: ${ip} - User-Agent: ${userAgent}`,
		)

		res.on('finish', () => {
			const { statusCode } = res
			const contentLength = res.get('content-length')
			const duration = Date.now() - startTime

			this.logger.log(
				`Outgoing Response: ${method} ${originalUrl} - IP: ${ip} - User-Agent: ${userAgent} - Status: ${statusCode} - Content-Length: ${contentLength} - Duration: ${duration}ms`,
			)

			if (statusCode >= 400) {
				this.logger.error(
					`Error Response: ${method} ${originalUrl} - IP: ${ip} - User-Agent: ${userAgent} - Status: ${statusCode} - Content-Length: ${contentLength} - Duration: ${duration}ms`,
				)
			}
		})

		res.on('error', (err: Error) => {
			this.logger.error(
				`Response Error: ${method} ${originalUrl} - IP: ${ip} - User-Agent: ${userAgent} - Error: ${err.message}`,
			)
		})

		res.on('timeout', () => {
			this.logger.error(
				`Response Timeout: ${method} ${originalUrl} - IP: ${ip} - User-Agent: ${userAgent}`,
			)
		})

		next()
	}
}

import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RoleGuard implements CanActivate {
	constructor(private reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
			context.getHandler(),
			context.getClass(),
		])

		if (!requiredRoles) {
			return true // No roles required, allow access
		}

		const user = context.switchToHttp().getRequest().user

		if (!user?.role) {
			throw new ForbiddenException('User role not found')
		}

		const hasRole = requiredRoles.includes(user.role)

		if (!hasRole) {
			throw new ForbiddenException(
				`Access denied. Required role(s): ${requiredRoles.join(', ')}`,
			)
		}

		return true
	}
}

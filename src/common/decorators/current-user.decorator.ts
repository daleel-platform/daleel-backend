import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
  };
}

/**
 * Parameter decorator that retrieves the current user's ID.
 *
 * Interim behavior: reads from the `x-user-id` request header.
 * Once an Auth guard is implemented, it seamlessly falls back to `request.user.id`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const headerUserId = request.headers['x-user-id'];

    if (typeof headerUserId === 'string' && headerUserId.trim().length > 0) {
      return headerUserId.trim();
    }

    if (
      Array.isArray(headerUserId) &&
      headerUserId.length > 0 &&
      typeof headerUserId[0] === 'string'
    ) {
      return headerUserId[0].trim();
    }

    return request.user?.id;
  },
);

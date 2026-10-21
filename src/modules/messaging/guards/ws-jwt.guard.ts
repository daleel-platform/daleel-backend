import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: { id: string };
    [key: string]: unknown;
  };
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    // If user is already verified via connection lifecycle
    if (client.data?.user?.id) {
      return true;
    }

    const token = this.extractToken(client);
    if (!token) {
      throw new WsException('Unauthorized: Missing access token');
    }

    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, { secret });

      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0
      ) {
        throw new WsException('Unauthorized: Invalid token payload');
      }

      client.data.user = { id: payload.sub };
      return true;
    } catch {
      throw new WsException('Unauthorized: Invalid or expired access token');
    }
  }

  extractToken(client: Socket): string | null {
    // 1. Check handshake auth object (e.g. socket = io(url, { auth: { token } }))
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.startsWith('Bearer ')
        ? authToken.slice(7).trim()
        : authToken.trim();
    }

    // 2. Check handshake headers authorization
    const authHeader = client.handshake.headers?.authorization;
    if (typeof authHeader === 'string') {
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}

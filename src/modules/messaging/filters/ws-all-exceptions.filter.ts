import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

@Catch()
export class WsAllExceptionsFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' &&
        response !== null &&
        'message' in response
          ? (response as { message: unknown }).message
          : exception.message;

      client.emit('error', {
        status: 'error',
        statusCode: exception.getStatus(),
        message,
      });
      return;
    }

    if (exception instanceof WsException) {
      client.emit('error', {
        status: 'error',
        message: exception.getError(),
      });
      return;
    }

    super.catch(exception, host);
  }
}

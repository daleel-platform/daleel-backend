import {
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DeleteMessageDto } from './dto/delete-message.dto.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import { JoinConversationDto } from './dto/join-conversation.dto.js';
import { MessageResponseDto } from './dto/message-response.dto.js';
import { ReplyMessageDto } from './dto/reply-message.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { WsAllExceptionsFilter } from './filters/ws-all-exceptions.filter.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import type { AuthenticatedSocket } from './guards/ws-jwt.guard.js';
import { MessagingService } from './messaging.service.js';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseGuards(WsJwtGuard)
@UseFilters(new WsAllExceptionsFilter())
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly messagingService: MessagingService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates JWT token on initial handshake. Rejects unauthenticated connections immediately.
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractHandshakeToken(client);
      if (!token) {
        client.emit('error', { message: 'Unauthorized: Missing token' });
        client.disconnect(true);
        return;
      }

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
        client.emit('error', {
          message: 'Unauthorized: Invalid token payload',
        });
        client.disconnect(true);
        return;
      }

      client.data = { ...client.data, user: { id: payload.sub } };
    } catch {
      client.emit('error', {
        message: 'Unauthorized: Invalid or expired token',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Sockets automatically leave rooms on disconnect
  }

  /**
   * Joins client to the conversation room after verifying participant access.
   */
  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: JoinConversationDto,
  ): Promise<{ success: boolean; conversationId: string }> {
    const userId = this.getSocketUserId(client);
    await this.messagingService.validateParticipant(dto.conversationId, userId);

    await client.join(`conversation:${dto.conversationId}`);
    return { success: true, conversationId: dto.conversationId };
  }

  /**
   * Leaves the conversation room.
   */
  @SubscribeMessage('leaveConversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: JoinConversationDto,
  ): Promise<{ success: boolean; conversationId: string }> {
    await client.leave(`conversation:${dto.conversationId}`);
    return { success: true, conversationId: dto.conversationId };
  }

  /**
   * Sends a message, saves to database, and broadcasts to room.
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const userId = this.getSocketUserId(client);
    const message = await this.messagingService.createMessage(userId, dto);

    this.server
      .to(`conversation:${dto.conversationId}`)
      .emit('messageCreated', message);

    return message;
  }

  /**
   * Explicit reply event; delegates to message creation with replyToId.
   */
  @SubscribeMessage('replyMessage')
  async handleReplyMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ReplyMessageDto,
  ): Promise<MessageResponseDto> {
    const userId = this.getSocketUserId(client);
    const message = await this.messagingService.createMessage(userId, {
      conversationId: dto.conversationId,
      content: dto.content,
      replyToId: dto.replyToId,
    });

    this.server
      .to(`conversation:${dto.conversationId}`)
      .emit('messageCreated', message);

    return message;
  }

  /**
   * Edits message content and broadcasts updated message to room.
   */
  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: EditMessageDto,
  ): Promise<MessageResponseDto> {
    const userId = this.getSocketUserId(client);
    const updated = await this.messagingService.editMessage(userId, dto);

    this.server
      .to(`conversation:${updated.conversationId}`)
      .emit('messageUpdated', updated);

    return updated;
  }

  /**
   * Soft-deletes message and broadcasts deletion event to room.
   */
  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: DeleteMessageDto,
  ): Promise<MessageResponseDto> {
    const userId = this.getSocketUserId(client);
    const deleted = await this.messagingService.deleteMessage(userId, dto);

    this.server
      .to(`conversation:${deleted.conversationId}`)
      .emit('messageDeleted', {
        messageId: deleted.id,
        conversationId: deleted.conversationId,
        isDeleted: true,
      });

    return deleted;
  }

  private extractHandshakeToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.startsWith('Bearer ')
        ? authToken.slice(7).trim()
        : authToken.trim();
    }

    const authHeader = client.handshake.headers?.authorization;
    if (typeof authHeader === 'string') {
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  private getSocketUserId(client: AuthenticatedSocket): string {
    const userId = client.data?.user?.id;
    if (!userId) {
      throw new WsException('Unauthorized: Missing authenticated user');
    }
    return userId;
  }
}

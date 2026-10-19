import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ConversationsService } from './conversations.service.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { MessagesService } from './messages.service.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingGateway } from './messaging.gateway.js';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [MessagingController],
  providers: [
    ConversationsService,
    MessagesService,
    MessagingGateway,
    WsJwtGuard,
  ],
  exports: [ConversationsService, MessagesService],
})
export class MessagingModule {}

import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ConversationsService } from './conversations.service.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { MessagesService } from './messages.service.js';
import { MessagingAttachmentsController } from './messaging-attachments.controller.js';
import { MessagingAttachmentsService } from './messaging-attachments.service.js';
import { MEDIA_MIME_TO_STORAGE } from './messaging.constants.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingGateway } from './messaging.gateway.js';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    JwtModule.register({}),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: Math.max(
            config.get<number>('STORAGE_IMAGE_MAX_BYTES', 5242880),
            config.get<number>('STORAGE_DOCUMENT_MAX_BYTES', 15728640),
          ),
          files: 1,
          fields: 10,
        },
        fileFilter: (_request, file, callback) => {
          if (
            !Object.hasOwn(MEDIA_MIME_TO_STORAGE, file.mimetype.toLowerCase())
          ) {
            return callback(
              new BadRequestException(
                'Only JPEG, PNG, WebP and PDF files are supported',
              ),
              false,
            );
          }
          callback(null, true);
        },
      }),
    }),
  ],
  controllers: [MessagingController, MessagingAttachmentsController],
  providers: [
    ConversationsService,
    MessagesService,
    MessagingGateway,
    MessagingAttachmentsService,
    WsJwtGuard,
  ],
  exports: [ConversationsService, MessagesService],
})
export class MessagingModule {}

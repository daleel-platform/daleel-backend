import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser, Serialize } from '../../common/index.js';
import { CreateAttachmentMessageDto } from './dto/create-attachment-message.dto.js';
import { MediaUrlResponseDto } from './dto/media-url-response.dto.js';
import { MessageResponseDto } from './dto/message-response.dto.js';
import { MessagingAttachmentsService } from './messaging-attachments.service.js';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class MessagingAttachmentsController {
  constructor(
    private readonly messagingAttachmentsService: MessagingAttachmentsService,
  ) {}

  @Post(':id/attachment-messages')
  @UseInterceptors(FileInterceptor('file'))
  @Serialize(MessageResponseDto)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload and send an attachment message in a conversation',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG, WebP image or PDF document',
        },
        content: {
          type: 'string',
          maxLength: 5000,
          description: 'Optional caption accompanying the attachment',
        },
        replyToId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional parent message UUID being replied to',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Attachment message sent successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or input payload' })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant in this conversation',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation or reply target message not found',
  })
  @ApiResponse({
    status: 413,
    description: 'Attachment exceeds maximum size limit',
  })
  @ApiResponse({ status: 500, description: 'Media upload failed' })
  @ApiResponse({ status: 503, description: 'Cloud storage is not configured' })
  async sendAttachmentMessage(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CreateAttachmentMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MessageResponseDto> {
    return this.messagingAttachmentsService.sendAttachmentMessage(
      userId,
      conversationId,
      file,
      dto,
    );
  }

  @Get(':id/messages/:messageId/media-url')
  @Serialize(MediaUrlResponseDto)
  @ApiOperation({
    summary: 'Generate a fresh signed URL for a message media attachment',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiParam({ name: 'messageId', description: 'Message UUID' })
  @ApiResponse({
    status: 200,
    description: 'Signed media URL generated successfully',
    type: MediaUrlResponseDto,
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant in this conversation',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation or media attachment not found',
  })
  @ApiResponse({ status: 503, description: 'Cloud storage is not configured' })
  async getMessageMediaUrl(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ): Promise<MediaUrlResponseDto> {
    return this.messagingAttachmentsService.getMessageMediaUrl(
      userId,
      conversationId,
      messageId,
    );
  }
}

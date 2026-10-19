import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser, Serialize } from '../../common/index.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationResponseDto } from './dto/conversation-response.dto.js';
import { CreateConversationDto } from './dto/create-conversation.dto.js';
import { MessageQueryDto } from './dto/message-query.dto.js';
import { PaginatedMessagesResponseDto } from './dto/paginated-messages-response.dto.js';
import { MessagesService } from './messages.service.js';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class MessagingController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {}

  @Post()
  @Serialize(ConversationResponseDto)
  @ApiOperation({ summary: 'Get or create a 1-to-1 conversation' })
  @ApiResponse({
    status: 201,
    description: 'Conversation retrieved or created successfully',
    type: ConversationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot create conversation with yourself',
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 404, description: 'Recipient user not found' })
  async createConversation(
    @CurrentUser() userId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.getOrCreateConversation(
      userId,
      dto.recipientId,
    );
  }

  @Get()
  @Serialize(ConversationResponseDto)
  @ApiOperation({
    summary: 'List all conversations for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of conversations retrieved successfully',
    type: [ConversationResponseDto],
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  async getConversations(
    @CurrentUser() userId: string,
  ): Promise<ConversationResponseDto[]> {
    return this.conversationsService.getUserConversations(userId);
  }

  @Get(':id/messages')
  @Serialize(PaginatedMessagesResponseDto)
  @ApiOperation({
    summary: 'Fetch paginated message history for a conversation',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Message history batch retrieved successfully',
    type: PaginatedMessagesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant in this conversation',
  })
  @ApiResponse({ status: 404, description: 'Conversation or cursor not found' })
  async getMessages(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: MessageQueryDto,
  ): Promise<PaginatedMessagesResponseDto> {
    return this.messagesService.getConversationMessages(userId, id, query);
  }
}

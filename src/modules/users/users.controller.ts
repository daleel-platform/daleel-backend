import { FileInterceptor } from '@nestjs/platform-express';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
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
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService, type UserWithMentorProfile } from './users.service.js';

@ApiTags('Users')
@Serialize(UserResponseDto)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile of currently authenticated user',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMe(@CurrentUser() userId: string): Promise<UserWithMentorProfile> {
    return this.usersService.findById(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserWithMentorProfile> {
    return this.usersService.findById(id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        bio: { type: 'string', maxLength: 500 },
        avatarUrl: { type: 'string', format: 'uri' },
        interests: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repeat the interests field for multipart requests.',
        },
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Optional JPEG, PNG or WebP profile photo; overrides avatarUrl.',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 413, description: 'Image exceeds size limit' })
  @ApiResponse({
    status: 500,
    description: 'Media upload or profile update failed',
  })
  @ApiResponse({ status: 503, description: 'Storage is not configured' })
  @ApiOperation({ summary: 'Update your profile and optional photo' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @CurrentUser() id: string,
    @Body() dto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UserWithMentorProfile> {
    return this.usersService.update(id, dto, file);
  }
}

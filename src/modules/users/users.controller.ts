import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiHeader({
    name: 'x-user-id',
    description: 'Current user UUID (interim authentication placeholder)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Profile of currently authenticated user',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMe(
    @CurrentUser() userId: string | undefined,
  ): Promise<UserWithMentorProfile> {
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
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

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserWithMentorProfile> {
    return this.usersService.update(id, dto);
  }
}

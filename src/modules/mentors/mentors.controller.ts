import { FileInterceptor } from '@nestjs/platform-express';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Serialize } from '../../common/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MentorsService } from './mentors.service.js';
import { CreateMentorDto } from './dto/create-mentor.dto.js';
import { UpdateMentorDto } from './dto/update-mentor.dto.js';
import { UpdateMentorStatusDto } from './dto/update-mentor-status.dto.js';
import { MentorQueryDto } from './dto/mentor-query.dto.js';
import {
  MentorResponseDto,
  PaginatedMentorResponseDto,
} from './dto/mentor-response.dto.js';

@ApiTags('Mentors')
@Controller('mentors')
export class MentorsController {
  constructor(private readonly mentors: MentorsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['headline', 'about', 'skills', 'yearsOfExperience'],
      properties: {
        headline: { type: 'string' },
        about: { type: 'string' },
        skills: {
          type: 'string',
          description: 'Comma-separated skills or JSON array',
          example: 'NestJS,TypeScript',
        },
        yearsOfExperience: {
          type: 'integer',
          minimum: 1,
          maximum: 60,
          example: 3,
        },
        linkedinUrl: {
          type: 'string',
          example: 'https://www.linkedin.com/in/example',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Optional JPEG, PNG or WebP profile photo',
        },
      },
    },
  })
  @ApiResponse({ status: 413, description: 'Image exceeds size limit' })
  @ApiResponse({ status: 503, description: 'Storage is not configured' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Serialize(MentorResponseDto)
  @ApiOperation({ summary: 'Create your mentor profile' })
  @ApiResponse({ status: 201, type: MentorResponseDto })
  @ApiResponse({ status: 409, description: 'Mentor profile already exists' })
  @ApiResponse({ status: 400, description: 'Invalid profile data' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'User no longer exists' })
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateMentorDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MentorResponseDto> {
    return this.mentors.create(userId, dto, file);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Serialize(MentorResponseDto)
  @ApiOperation({ summary: 'Update your mentor profile' })
  @ApiResponse({ status: 200, type: MentorResponseDto })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  @ApiResponse({ status: 400, description: 'Invalid profile data' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  update(
    @CurrentUser() userId: string,
    @Body() dto: UpdateMentorDto,
  ): Promise<MentorResponseDto> {
    return this.mentors.update(userId, dto);
  }

  @Patch('me/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Serialize(MentorResponseDto)
  @ApiOperation({ summary: 'Activate or deactivate your own mentor profile' })
  @ApiResponse({ status: 200, type: MentorResponseDto })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  @ApiResponse({ status: 400, description: 'isActive must be a boolean' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  setStatus(
    @CurrentUser() userId: string,
    @Body() dto: UpdateMentorStatusDto,
  ): Promise<MentorResponseDto> {
    return this.mentors.setStatus(userId, dto.isActive);
  }

  @Get()
  @Serialize(PaginatedMentorResponseDto)
  @ApiOperation({
    summary: 'Discover active mentors with filters and pagination',
  })
  @ApiResponse({ status: 200, type: PaginatedMentorResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid search or pagination parameters',
  })
  findAll(@Query() query: MentorQueryDto): Promise<PaginatedMentorResponseDto> {
    return this.mentors.findAll(query);
  }

  @Get(':id')
  @Serialize(MentorResponseDto)
  @ApiOperation({ summary: 'Get an active mentor by mentor profile ID' })
  @ApiResponse({ status: 200, type: MentorResponseDto })
  @ApiResponse({ status: 404, description: 'Mentor not found or inactive' })
  @ApiResponse({ status: 400, description: 'Invalid UUID' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MentorResponseDto> {
    return this.mentors.findOne(id);
  }
}

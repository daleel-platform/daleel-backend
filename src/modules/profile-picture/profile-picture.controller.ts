import {
  BadRequestException,
  Controller,
  HttpCode,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Serialize } from '../../common/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ProfilePictureService } from './profile-picture.service.js';
import { ProfilePictureResponseDto } from './dto/profile-picture-response.dto.js';

@ApiTags('Users')
@Controller('users/me/avatar')
export class ProfilePictureController {
  constructor(private readonly avatars: ProfilePictureService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload or replace your public profile photo',
  })
  @ApiResponse({ status: 200, type: ProfilePictureResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Missing, invalid or unsupported image',
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Concurrent avatar change; retry' })
  @ApiResponse({
    status: 413,
    description: 'Upload exceeds configured byte limit',
  })
  @ApiResponse({
    status: 503,
    description: 'Cloudinary credentials are not configured',
  })
  @Serialize(ProfilePictureResponseDto)
  upload(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ProfilePictureResponseDto> {
    if (!file) throw new BadRequestException('Image file is required');
    return this.avatars.upload(userId, file);
  }
}

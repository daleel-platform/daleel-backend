import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Serialize } from '../../common/index.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { PasswordResetResponseDto } from './dto/password-reset-response.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { PasswordResetService } from './password-reset.service.js';

@ApiTags('Auth')
@Controller('auth')
@Serialize(PasswordResetResponseDto)
export class PasswordResetController {
  constructor(private passwordReset: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiResponse({
    status: 200,
    type: PasswordResetResponseDto,
    description: 'Same response whether or not the email exists',
  })
  @ApiResponse({ status: 400, description: 'Invalid email' })
  requestReset(
    @Body() dto: ForgotPasswordDto,
  ): Promise<PasswordResetResponseDto> {
    return this.passwordReset.requestReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password using a single-use reset token',
  })
  @ApiResponse({ status: 200, type: PasswordResetResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid password, invalid, expired, or already-used token',
  })
  resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<PasswordResetResponseDto> {
    return this.passwordReset.resetPassword(dto);
  }
}

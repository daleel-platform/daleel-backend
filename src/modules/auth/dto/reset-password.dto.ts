import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { RegisterDto } from './register.dto.js';

// Inherit exactly the same password validation as registration.
export class ResetPasswordDto extends PickType(RegisterDto, [
  'password',
] as const) {
  @ApiProperty({
    description: 'Single-use token from the reset link',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}

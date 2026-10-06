import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PasswordResetResponseDto {
  @Expose()
  @ApiProperty()
  message!: string;
}

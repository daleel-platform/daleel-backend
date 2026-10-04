import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived access JWT' })
  @Expose()
  accessToken!: string;

  @ApiProperty({ example: 900 })
  @Expose()
  expiresIn!: number;

  @ApiProperty({ type: () => UserResponseDto })
  @Expose()
  @Type(() => UserResponseDto)
  user!: UserResponseDto;
}

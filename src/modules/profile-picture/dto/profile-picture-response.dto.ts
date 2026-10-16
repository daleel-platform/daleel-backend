import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ProfilePictureResponseDto {
  @Expose()
  @ApiProperty()
  avatarUrl: string;
}

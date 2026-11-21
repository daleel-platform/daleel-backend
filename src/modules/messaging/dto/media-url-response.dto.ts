import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MediaUrlResponseDto {
  @ApiProperty({ description: 'Time-limited signed URL for the attachment' })
  @Expose()
  mediaUrl!: string;

  @ApiProperty({ description: 'URL validity duration in seconds' })
  @Expose()
  expiresIn!: number;
}

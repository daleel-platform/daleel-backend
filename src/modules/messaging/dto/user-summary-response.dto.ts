import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class UserSummaryResponseDto {
  @ApiProperty({ description: 'User unique identifier' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Full name of the user' })
  @Expose()
  name!: string;

  @ApiPropertyOptional({
    description: 'Avatar URL of the user',
    nullable: true,
  })
  @Expose()
  avatarUrl!: string | null;
}

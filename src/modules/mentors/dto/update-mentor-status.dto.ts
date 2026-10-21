import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateMentorStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}

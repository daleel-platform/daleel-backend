import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAttachmentMessageDto {
  @ApiPropertyOptional({
    description: 'Optional caption accompanying the attachment',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({
    description: 'Optional parent message UUID being replied to',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}

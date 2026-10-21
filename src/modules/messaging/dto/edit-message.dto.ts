import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class EditMessageDto {
  @ApiProperty({ description: 'Message UUID to edit' })
  @IsUUID()
  @IsNotEmpty()
  messageId!: string;

  @ApiProperty({ description: 'New text content', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}

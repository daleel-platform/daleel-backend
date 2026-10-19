import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class DeleteMessageDto {
  @ApiProperty({ description: 'Message UUID to delete' })
  @IsUUID()
  @IsNotEmpty()
  messageId!: string;
}

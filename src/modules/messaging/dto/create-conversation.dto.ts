import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'UUID of the user to start a conversation with',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  recipientId!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass1!' })
  @IsString()
  @IsByteLength(1, 72)
  password!: string;
}

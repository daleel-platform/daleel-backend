import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Amr Khaled' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description:
      'At least 8 and no more than 72 bytes, with uppercase, lowercase, numeric, and special characters',
    example: 'SecurePass1!',
  })
  @IsString()
  @IsByteLength(8, 72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
  password!: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsUrl()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Software engineer interested in mentoring' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ type: [String], example: ['Web Development'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  interests?: string[];
}

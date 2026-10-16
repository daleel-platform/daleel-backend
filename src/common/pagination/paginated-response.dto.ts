import { Type as NestType } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { PaginationMetaDto } from './pagination-meta.dto.js';

export function PaginatedResponseDto<T>(itemType: NestType<T>) {
  class PaginatedResponse {
    @Expose()
    @Type(() => itemType)
    @ApiProperty({ type: () => itemType, isArray: true })
    items: T[];

    @Expose()
    @Type(() => PaginationMetaDto)
    @ApiProperty({ type: PaginationMetaDto })
    meta: PaginationMetaDto;
  }
  return PaginatedResponse;
}

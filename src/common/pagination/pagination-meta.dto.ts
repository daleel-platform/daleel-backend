import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from './pagination-query.dto.js';

export class PaginationMetaDto {
  @Expose() @ApiProperty() totalItems: number;
  @Expose() @ApiProperty() itemCount: number;
  @Expose() @ApiProperty() itemsPerPage: number;
  @Expose() @ApiProperty() totalPages: number;
  @Expose() @ApiProperty() currentPage: number;
  @Expose() @ApiProperty() hasNextPage: boolean;
  @Expose() @ApiProperty() hasPreviousPage: boolean;

  static create(
    totalItems: number,
    itemCount: number,
    query: PaginationQueryDto,
  ): PaginationMetaDto {
    const totalPages = Math.ceil(totalItems / query.limit);
    return {
      totalItems,
      itemCount,
      itemsPerPage: query.limit,
      totalPages,
      currentPage: query.page,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    };
  }
}

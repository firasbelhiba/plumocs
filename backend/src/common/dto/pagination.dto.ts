import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Shared list-endpoint query: offset pagination + sort. */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  sort?: string;
}

export function pageEnvelope<T>(data: T[], total: number, offset: number, limit: number) {
  return { data, page: { offset, limit, total } };
}

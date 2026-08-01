import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean;

  /** Storage keys from /attachments/presign, linked on create. */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachmentIds?: string[];
}

import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../common/guards/team-scope.service';
import { CurrentUser, Principal } from '../common/decorators';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const BLOCKED_TYPES = ['application/x-msdownload', 'application/x-sh', 'application/x-executable'];

class PresignDto {
  @IsString() filename!: string;
  @IsString() contentType!: string;
  @IsInt() @Min(1) @Max(MAX_SIZE_BYTES) sizeBytes!: number;
}

/** Presigned upload/download against S3/MinIO (§6 AttachmentsModule). */
@Injectable()
export class AttachmentsService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeamScopeService,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('s3.bucket')!;
    this.s3 = new S3Client({
      region: config.get<string>('s3.region'),
      endpoint: config.get<string>('s3.endpoint') || undefined,
      forcePathStyle: true, // MinIO
      credentials: {
        accessKeyId: config.get<string>('s3.accessKey') ?? '',
        secretAccessKey: config.get<string>('s3.secretKey') ?? '',
      },
    });
  }

  /**
   * Returns an upload URL + a pending attachment row. The row is linked to a
   * message when the message is created (attachmentIds on POST …/messages).
   */
  async presignUpload(dto: PresignDto) {
    if (BLOCKED_TYPES.includes(dto.contentType)) {
      throw new BadRequestException('This file type is not allowed');
    }
    const storageKey = `attachments/${randomUUID()}/${dto.filename}`;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: dto.contentType,
        ContentLength: dto.sizeBytes,
      }),
      { expiresIn: 600 },
    );
    // Rows start "pending" (no message) and are linked when the reply is
    // posted via attachmentIds on POST /tickets/:id/messages.
    const attachment = await this.prisma.attachment.create({
      data: {
        filename: dto.filename,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        storageKey,
      },
    });
    return {
      attachmentId: attachment.id,
      storageKey,
      uploadUrl,
      maxSizeBytes: MAX_SIZE_BYTES,
    };
  }

  /** Download is gated by ticket access (§8.3: attachments on *accessible* tickets). */
  async presignDownload(id: string, principal: Principal) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { ticketMessage: { select: { ticketId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    if (attachment.ticketMessage) {
      await this.scope.loadAndAssert(attachment.ticketMessage.ticketId, principal);
    } else if (principal.kind === 'user' && principal.role !== 'admin') {
      // pending (unlinked) uploads are not downloadable until attached
      throw new ForbiddenException('Attachment is not linked to a conversation yet');
    }
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: attachment.storageKey }),
      { expiresIn: 600 },
    );
    return { url, filename: attachment.filename, contentType: attachment.contentType };
  }
}

@ApiTags('attachments')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('presign')
  presign(@Body() dto: PresignDto) {
    return this.attachments.presignUpload(dto);
  }

  @Get(':id/url')
  download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.attachments.presignDownload(id, principal);
  }
}

@Module({
  providers: [AttachmentsService, TeamScopeService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

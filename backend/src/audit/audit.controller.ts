import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Global audit search — admin only. Per-ticket trails live under /tickets/:id/audit. */
  @Get()
  @Roles('admin')
  search(
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('offset') offset = '0',
    @Query('limit') limit = '50',
  ) {
    return this.audit.search({
      entityType,
      actorId,
      offset: parseInt(offset, 10),
      limit: Math.min(parseInt(limit, 10), 200),
    });
  }
}

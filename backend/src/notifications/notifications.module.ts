import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Principal } from '../common/decorators';

/** In-app notifications; the email leg is handled by the worker fanout job. */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query('unread') unread?: string) {
    return this.notifications.list(principal.id, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() principal: Principal) {
    return this.notifications.unreadCount(principal.id);
  }

  @Post(':id/read')
  markRead(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(principal.id, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() principal: Principal) {
    return this.notifications.markAllRead(principal.id);
  }
}

@Module({
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}

import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addBusinessMinutes, businessMinutesBetween, BusinessCalendar } from './business-hours.util';

/**
 * SLA policy CRUD + due-time computation + pause/resume (§9).
 * The breach sweep itself runs in the worker (SlaSweepProcessor).
 */
@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- policies ----
  listPolicies() {
    return this.prisma.slaPolicy.findMany({ include: { businessHours: true }, orderBy: { name: 'asc' } });
  }

  async getPolicy(id: string) {
    const p = await this.prisma.slaPolicy.findUnique({ where: { id }, include: { businessHours: true } });
    if (!p) throw new NotFoundException('SLA policy not found');
    return p;
  }

  createPolicy(data: {
    name: string;
    priority: TicketPriority;
    firstResponseMins: number;
    resolutionMins: number;
    businessHoursId?: string | null;
  }) {
    return this.prisma.slaPolicy.create({ data });
  }

  updatePolicy(id: string, data: Partial<{ name: string; firstResponseMins: number; resolutionMins: number; businessHoursId: string | null; isActive: boolean }>) {
    return this.prisma.slaPolicy.update({ where: { id }, data });
  }

  deletePolicy(id: string) {
    return this.prisma.slaPolicy.update({ where: { id }, data: { isActive: false } });
  }

  // ---- business hours ----
  listBusinessHours() {
    return this.prisma.businessHours.findMany({ orderBy: { name: 'asc' } });
  }

  createBusinessHours(data: { name: string; timezone: string; weeklyJson: unknown; holidaysJson?: unknown }) {
    return this.prisma.businessHours.create({
      data: {
        name: data.name,
        timezone: data.timezone,
        weeklyJson: data.weeklyJson as object,
        holidaysJson: (data.holidaysJson ?? []) as object,
      },
    });
  }

  updateBusinessHours(id: string, data: Partial<{ name: string; timezone: string; weeklyJson: unknown; holidaysJson: unknown }>) {
    return this.prisma.businessHours.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.weeklyJson !== undefined ? { weeklyJson: data.weeklyJson as object } : {}),
        ...(data.holidaysJson !== undefined ? { holidaysJson: data.holidaysJson as object } : {}),
      },
    });
  }

  // ---- computation ----

  /** The calendar attached to a ticket's policy, if any. */
  async calendarForTicket(slaPolicyId: string | null): Promise<BusinessCalendar | null> {
    if (!slaPolicyId) return null;
    const policy = await this.prisma.slaPolicy.findUnique({
      where: { id: slaPolicyId },
      include: { businessHours: true },
    });
    return this.calendarOf(policy);
  }

  /** Pick the active policy for a priority. */
  policyForPriority(priority: TicketPriority) {
    return this.prisma.slaPolicy.findFirst({
      where: { priority, isActive: true },
      include: { businessHours: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  calendarOf(policy: { businessHours: { timezone: string; weeklyJson: unknown; holidaysJson: unknown } | null } | null): BusinessCalendar | null {
    const bh = policy?.businessHours;
    if (!bh) return null;
    return {
      timezone: bh.timezone,
      weekly: bh.weeklyJson as BusinessCalendar['weekly'],
      holidays: (bh.holidaysJson as string[]) ?? [],
    };
  }

  /** Compute both due times for a new ticket. */
  async computeDueTimes(priority: TicketPriority, from: Date) {
    const policy = await this.policyForPriority(priority);
    if (!policy) return { policyId: null, firstResponseDueAt: null, resolutionDueAt: null };
    const calendar = this.calendarOf(policy);
    return {
      policyId: policy.id,
      firstResponseDueAt: addBusinessMinutes(from, policy.firstResponseMins, calendar),
      resolutionDueAt: addBusinessMinutes(from, policy.resolutionMins, calendar),
    };
  }

  /**
   * Timer updates on a status transition (called by TicketsService inside
   * its transaction). Entering pending/on_hold pauses the clock; returning
   * to open extends both due times by the paused duration.
   */
  timerPatchForTransition(
    ticket: { slaPausedAt: Date | null; firstResponseDueAt: Date | null; resolutionDueAt: Date | null },
    to: string,
    now = new Date(),
    calendar: BusinessCalendar | null = null,
  ): Record<string, Date | null> {
    const pausedStates = ['pending', 'on_hold'];
    const patch: Record<string, Date | null> = {};

    if (pausedStates.includes(to)) {
      if (!ticket.slaPausedAt) patch.slaPausedAt = now;
    } else if (ticket.slaPausedAt) {
      // Extend by the BUSINESS time the pause consumed. A pause over a weekend
      // burns no business minutes, so the deadline must not drift.
      const pausedMins = businessMinutesBetween(ticket.slaPausedAt, now, calendar);
      const pausedMs = pausedMins * 60_000;
      patch.slaPausedAt = null;
      if (ticket.firstResponseDueAt) patch.firstResponseDueAt = new Date(ticket.firstResponseDueAt.getTime() + pausedMs);
      if (ticket.resolutionDueAt) patch.resolutionDueAt = new Date(ticket.resolutionDueAt.getTime() + pausedMs);
    }

    if (to === 'resolved') patch.resolvedAt = now;
    if (to === 'closed') patch.closedAt = now;
    return patch;
  }
}

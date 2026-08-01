import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';

const STATUSES = ['new', 'open', 'pending', 'on_hold', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const CHANNELS = ['email', 'api', 'widget', 'hashcare', 'manual'] as const;

export class CreateTicketDto {
  @IsString() subject!: string;

  /** Either an existing customer id or an email to find-or-create. */
  @ValidateIf((o) => !o.customerEmail)
  @IsUUID()
  customerId?: string;

  @ValidateIf((o) => !o.customerId)
  @IsEmail()
  customerEmail?: string;

  @IsOptional() @IsString() customerName?: string;

  @IsOptional() @IsIn(PRIORITIES) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsIn(CHANNELS) channel?: (typeof CHANNELS)[number];
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() body?: string; // first message
  @IsOptional() @IsString() sourceRef?: string;
}

export class ListTicketsDto {
  @IsOptional() @IsIn(['all-open', 'unassigned', 'my-open', 'breaching', 'pending', 'resolved'])
  view?: string;

  @IsOptional() @IsString() status?: string; // comma-separated
  @IsOptional() @IsString() priority?: string; // comma-separated
  @IsOptional() @IsString() channel?: string; // comma-separated
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsString() assigneeId?: string; // uuid | "@unassigned"
  @IsOptional() @IsString() q?: string;

  /** Relative window on updatedAt, matching the console's filter rail. */
  @IsOptional() @IsIn(['any', 'today', '7d', '30d'])
  range?: string;

  @IsOptional() @IsIn(['updated', 'created', 'priority', 'sla'])
  sort?: string = 'updated';

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number = 0;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 25;

  /** Cursor pagination: pass the previous page's `page.nextCursor` (a ticket id). Takes precedence over offset. */
  @IsOptional() @IsUUID()
  cursor?: string;
}

export class PatchTicketDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(PRIORITIES) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @ValidateIf((o) => o.assigneeId !== null) @IsUUID() assigneeId?: string | null;
  @IsOptional() @ValidateIf((o) => o.teamId !== null) @IsUUID() teamId?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsIn(['answered', 'escalated', 'out_of_scope']) outcome?: 'answered' | 'escalated' | 'out_of_scope';
}

export class AssignDto {
  /** A user id, the literal "me", or null to unassign. */
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsUUID() teamId?: string;
}

export class TransitionDto {
  @IsIn(STATUSES) status!: (typeof STATUSES)[number];
}

export class MergeDto {
  @IsUUID()
  targetId!: string;
}

export class BulkDto {
  @IsArray() @ArrayNotEmpty() @IsUUID(undefined, { each: true })
  ids!: string[];

  @IsIn(['assign', 'status', 'tag', 'close'])
  action!: 'assign' | 'status' | 'tag' | 'close';

  @IsOptional() @IsString() assigneeId?: string; // for assign ("me" allowed)
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number]; // for status
  @IsOptional() @IsString() tag?: string; // for tag
}

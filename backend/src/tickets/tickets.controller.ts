import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { AllowApiKey, CurrentUser, Principal, Roles, Scopes } from '../common/decorators';
import { AssignDto, BulkDto, CreateTicketDto, ListTicketsDto, MergeDto, PatchTicketDto, TransitionDto } from './dto/tickets.dto';
import { MessagesService } from '../messages/messages.service';
import { CreateMessageDto } from '../messages/dto/create-message.dto';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly messages: MessagesService,
  ) {}

  @Post()
  @AllowApiKey()
  @Scopes('tickets:write')
  create(@Body() dto: CreateTicketDto, @CurrentUser() principal: Principal) {
    return this.tickets.create(dto, principal);
  }

  @Get()
  @AllowApiKey()
  @Scopes('tickets:read')
  list(@Query() dto: ListTicketsDto, @CurrentUser() principal: Principal) {
    return this.tickets.list(dto, principal);
  }

  /** Declared before :id so 'counts' is never parsed as a ticket id. */
  @Get('counts')
  @AllowApiKey()
  @Scopes('tickets:read')
  counts(@CurrentUser() principal: Principal) {
    return this.tickets.counts(principal);
  }

  @Get(':id')
  @AllowApiKey()
  @Scopes('tickets:read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.tickets.get(id, principal);
  }

  @Patch(':id')
  @AllowApiKey()
  @Scopes('tickets:write')
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchTicketDto, @CurrentUser() principal: Principal) {
    return this.tickets.patch(id, dto, principal);
  }

  @Post(':id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto, @CurrentUser() principal: Principal) {
    return this.tickets.assign(id, dto, principal);
  }

  @Post(':id/status')
  @AllowApiKey()
  @Scopes('tickets:write')
  transition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto, @CurrentUser() principal: Principal) {
    return this.tickets.transition(id, dto.status as never, principal);
  }

  @Post(':id/messages')
  @AllowApiKey()
  @Scopes('tickets:write')
  addMessage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMessageDto, @CurrentUser() principal: Principal) {
    return this.messages.add(id, dto, principal);
  }

  @Post('bulk')
  @Roles('lead')
  bulk(@Body() dto: BulkDto, @CurrentUser() principal: Principal) {
    return this.tickets.bulk(dto, principal);
  }

  @Post(':id/merge')
  @Roles('lead')
  merge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto, @CurrentUser() principal: Principal) {
    return this.tickets.merge(id, dto.targetId, principal);
  }

  @Get(':id/audit')
  auditTrail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.tickets.auditTrail(id, principal);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.tickets.remove(id, principal);
  }
}

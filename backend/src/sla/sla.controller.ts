import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { SlaService } from './sla.service';
import { Roles } from '../common/decorators';

class CreateSlaPolicyDto {
  @IsString() name!: string;
  @IsIn(['low', 'normal', 'high', 'urgent']) priority!: 'low' | 'normal' | 'high' | 'urgent';
  @IsInt() @Min(1) firstResponseMins!: number;
  @IsInt() @Min(1) resolutionMins!: number;
  @IsOptional() @IsUUID() businessHoursId?: string;
}

class UpdateSlaPolicyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) firstResponseMins?: number;
  @IsOptional() @IsInt() @Min(1) resolutionMins?: number;
  @IsOptional() @IsUUID() businessHoursId?: string;
  /** Deletion is a soft deactivate — this is how a policy comes back. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateBusinessHoursDto {
  @IsString() name!: string;
  @IsString() timezone!: string;
  @IsObject() weeklyJson!: Record<string, Array<[string, string]>>;
  @IsOptional() holidaysJson?: string[];
}

class UpdateBusinessHoursDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsObject() weeklyJson?: Record<string, Array<[string, string]>>;
  @IsOptional() holidaysJson?: string[];
}

@ApiTags('sla')
@Controller()
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  // ---- policies (view: everyone; manage: admin) ----
  @Get('sla-policies')
  listPolicies() {
    return this.sla.listPolicies();
  }

  @Get('sla-policies/:id')
  getPolicy(@Param('id', ParseUUIDPipe) id: string) {
    return this.sla.getPolicy(id);
  }

  @Post('sla-policies')
  @Roles('admin')
  createPolicy(@Body() dto: CreateSlaPolicyDto) {
    return this.sla.createPolicy(dto);
  }

  @Patch('sla-policies/:id')
  @Roles('admin')
  updatePolicy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlaPolicyDto) {
    return this.sla.updatePolicy(id, dto);
  }

  @Delete('sla-policies/:id')
  @Roles('admin')
  deletePolicy(@Param('id', ParseUUIDPipe) id: string) {
    return this.sla.deletePolicy(id);
  }

  // ---- business hours ----
  @Get('business-hours')
  listBusinessHours() {
    return this.sla.listBusinessHours();
  }

  @Post('business-hours')
  @Roles('admin')
  createBusinessHours(@Body() dto: CreateBusinessHoursDto) {
    return this.sla.createBusinessHours(dto);
  }

  @Patch('business-hours/:id')
  @Roles('admin')
  updateBusinessHours(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessHoursDto) {
    return this.sla.updateBusinessHours(id, dto);
  }
}

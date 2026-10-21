import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { BotConfigService } from './bot-config.service';
type AuthRequest = Request & { user: User };
@Controller('bot-config')
@UseGuards(JwtAuthGuard)
export class BotConfigController {
  constructor(private readonly configuration: BotConfigService) {}
  private admin(request: AuthRequest) {
    if (request.user.role !== UserRole.ADMIN)
      throw new ForbiddenException(
        'Sólo un administrador puede gestionar el asistente.',
      );
  }
  @Get() overview(@Req() request: AuthRequest) {
    this.admin(request);
    return this.configuration.overview();
  }
  @Put('draft') save(
    @Req() request: AuthRequest,
    @Body() body: { configuration?: unknown; revision?: unknown } | null,
  ) {
    this.admin(request);
    return this.configuration.save(
      body?.configuration,
      body?.revision,
      request.user.id,
    );
  }
  @Post('validate') validate(
    @Req() request: AuthRequest,
    @Body() body: { revision?: unknown } | null,
  ) {
    this.admin(request);
    return this.configuration.validate(body?.revision);
  }
  @Post('publish') publish(
    @Req() request: AuthRequest,
    @Body() body: { revision?: unknown; activeVersion?: unknown } | null,
  ) {
    this.admin(request);
    return this.configuration.publish(
      body?.revision,
      body?.activeVersion,
      request.user.id,
    );
  }
  @Post('restore/:version') restore(
    @Req() request: AuthRequest,
    @Param('version') version: string,
    @Body() body: { revision?: unknown } | null,
  ) {
    this.admin(request);
    return this.configuration.restore(
      Number(version),
      body?.revision,
      request.user.id,
    );
  }
}

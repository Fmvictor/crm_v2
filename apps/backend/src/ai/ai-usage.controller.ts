import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AiUsageService } from './ai-usage.service';

@Controller('ai-usage')
@UseGuards(JwtAuthGuard)
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}
  private admin(user: User): void {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException(
        'Sólo un administrador puede consultar o cambiar el presupuesto.',
      );
  }
  @Get()
  summary(@Req() request: Request & { user: User }) {
    this.admin(request.user);
    return this.usage.summary();
  }
  @Patch('budget')
  configure(
    @Req() request: Request & { user: User },
    @Body() body: { monthlyLimitEur?: unknown; version?: unknown } | null,
  ) {
    this.admin(request.user);
    return this.usage.configure(
      body?.monthlyLimitEur,
      body?.version,
      request.user.id,
    );
  }
}

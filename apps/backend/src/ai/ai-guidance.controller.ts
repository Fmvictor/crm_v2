import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
  ConflictException,
  Query,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { BotConfigService } from '../bot-config/bot-config.service';
import { AiGuidanceService } from './ai-guidance.service';
import { BotLearningStatus } from './entities/bot-learning.entity';

type AuthenticatedRequest = Request & { user: User };

@Controller('ai-guidance')
@UseGuards(JwtAuthGuard)
export class AiGuidanceController {
  constructor(
    private readonly guidanceService: AiGuidanceService,
    private readonly configuration: BotConfigService,
  ) {}

  @Get()
  async getConfiguration(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request.user);
    const [snapshot, paused] = await Promise.all([
      this.configuration.active(),
      this.guidanceService.isPaused(),
    ]);
    return {
      instruction: snapshot.configuration.assistant,
      version: snapshot.version,
      paused,
    };
  }

  @Get('learnings')
  listLearnings(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: BotLearningStatus,
  ) {
    this.assertAdmin(request.user);
    return this.guidanceService.listLearnings(status);
  }

  @Post('instructions')
  replaceInstruction(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request.user);
    throw new ConflictException(
      'Gestiona las instrucciones en Asistente, mediante borrador y publicación.',
    );
  }

  @Patch('learnings/:id')
  async reviewLearning(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      status: BotLearningStatus.APPROVED | BotLearningStatus.REJECTED;
      category?: string;
      approvedText?: string;
    },
  ) {
    this.assertAdmin(request.user);
    if (
      ![BotLearningStatus.APPROVED, BotLearningStatus.REJECTED].includes(
        body.status,
      )
    ) {
      throw new ForbiddenException('Estado de aprendizaje no válido');
    }
    return this.guidanceService.reviewLearning(
      id,
      request.user.id,
      body.status,
      body.category,
      body.approvedText,
    );
  }

  @Post('paused')
  async setPaused(
    @Req() request: AuthenticatedRequest,
    @Body() body: { paused: boolean },
  ) {
    this.assertAdmin(request.user);
    return this.guidanceService.setPaused(
      Boolean(body.paused),
      request.user.id,
    );
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException(
        'Solo un administrador puede modificar la IA',
      );
  }
}

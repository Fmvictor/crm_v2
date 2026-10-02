import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
  Query,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AiGuidanceService } from './ai-guidance.service';
import { BotLearningStatus } from './entities/bot-learning.entity';

type AuthenticatedRequest = Request & { user: User };

@Controller('ai-guidance')
@UseGuards(JwtAuthGuard)
export class AiGuidanceController {
  constructor(private readonly guidanceService: AiGuidanceService) {}

  @Get()
  getConfiguration(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request.user);
    return this.guidanceService.getConfiguration();
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
  async replaceInstruction(
    @Req() request: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    this.assertAdmin(request.user);
    return this.guidanceService.replaceInstruction(body.text, request.user.id);
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

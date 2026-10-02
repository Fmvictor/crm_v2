import {
  Controller,
  Get,
  Param,
  Query,
  Patch,
  Body,
  UseGuards,
  Post,
  Inject,
  forwardRef,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ConversationAiMode } from './entities/conversation.entity';
import { PipelineEventActor } from './entities/pipeline-event.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ConversationMessageActor } from './entities/conversation-message.entity';
import { User, UserRole } from '../users/entities/user.entity';

type AuthenticatedRequest = Request & { user: User };

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsAppService: WhatsAppService,
  ) {}

  @Get()
  findAll(
    @Query('stage') stage?: PipelineStage,
    @Query('aiMode') aiMode?: ConversationAiMode,
    @Query('course') course?: string,
    @Query('language') language?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.findAll({
      stage,
      aiMode,
      course,
      language,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
  }

  @Get('knowledge')
  listKnowledge() {
    return this.conversationsService.listKnowledge();
  }

  @Patch('knowledge/:id/approve')
  approveKnowledge(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request.user);
    return this.conversationsService.approveKnowledge(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Patch(':id/mode')
  setMode(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { aiMode: ConversationAiMode; reason?: string },
  ) {
    this.assertCanEdit(request.user);
    if (body.aiMode === ConversationAiMode.AUTO) this.assertAdmin(request.user);
    return this.conversationsService.setMode(id, body.aiMode, body.reason);
  }

  @Patch(':id/stage')
  setStage(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { stage: PipelineStage; reason?: string },
  ) {
    this.assertCanEdit(request.user);
    return this.conversationsService.moveStage(
      id,
      body.stage,
      PipelineEventActor.AGENT,
      body.reason ?? 'Cambio manual desde el CRM',
    );
  }

  @Patch(':id/lead')
  updateLead(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      courseInterest?: string;
      language?: string;
      optIn?: boolean;
      optOut?: boolean;
      summary?: string;
    },
  ) {
    this.assertCanEdit(request.user);
    return this.conversationsService.updateLead(id, body);
  }

  @Post(':id/send')
  async send(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    this.assertCanEdit(request.user);
    const conversation = await this.conversationsService.findOne(id);
    await this.whatsAppService.sendText(
      conversation.externalContactKey,
      body.text,
      ConversationMessageActor.AGENT,
      request.user.id,
    );
    return this.conversationsService.findOne(id);
  }

  private assertCanEdit(user: User) {
    if (user.role === UserRole.VIEWER)
      throw new ForbiddenException(
        'No tienes permiso para modificar conversaciones',
      );
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException(
        'Solo un administrador puede realizar esta acción',
      );
  }
}

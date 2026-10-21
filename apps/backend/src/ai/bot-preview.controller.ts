import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { BotConfigService } from '../bot-config/bot-config.service';
import { AiBudgetBlockedError } from './ai-usage.service';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { humanRequest } from './conversation-language';
import { configHash } from '../bot-config/config-schema';
import { buildInstructions } from '../bot-config/prompt-builder';
@Controller('bot-config')
@UseGuards(JwtAuthGuard)
export class BotPreviewController {
  constructor(
    private readonly configuration: BotConfigService,
    private readonly model: OpenAiService,
    private readonly web: WebKnowledgeService,
  ) {}
  @Post('preview') async preview(
    @Req() request: Request & { user: User },
    @Body()
    body: { revision?: number; question?: string; useAi?: boolean } | null,
  ) {
    if (request.user.role !== UserRole.ADMIN)
      throw new ForbiddenException(
        'Sólo un administrador puede probar el asistente.',
      );
    if (
      typeof body?.question !== 'string' ||
      !body.question.trim() ||
      body.question.length > 2000 ||
      typeof body.useAi !== 'boolean'
    )
      throw new BadRequestException(
        'Introduce una pregunta de prueba de hasta 2.000 caracteres.',
      );
    const overview = await this.configuration.overview();
    if (body.revision !== overview.state.draftRevision)
      throw new BadRequestException('Recarga el borrador antes de probarlo.');
    const snapshot = {
      ...overview.active,
      configuration: overview.state.draft,
    };
    const context = await this.configuration.documentContext(
      snapshot,
      body.question,
      () => this.web.getContext(body.question!),
    );
    if (context.handoff || humanRequest(body.question))
      return {
        handoff: true,
        reason: 'La pregunta coincide con las reglas de derivación.',
        sources: context.sources,
      };
    if (!body.useAi)
      return {
        instructions: buildInstructions(snapshot.configuration, 'new'),
        context: context.context,
        sources: context.sources,
        aiUsed: false,
      };
    // Las pruebas no son publicaciones ni conversaciones reales; siguen el presupuesto.
    try {
      const decision = await this.model.decide({
        currentStage: 'new',
        messages: [{ direction: 'inbound', body: body.question }],
        webContext: context.context,
        configuration: snapshot,
        sources: context.sources,
        preview: {
          revision: overview.state.draftRevision,
          hash: configHash(snapshot.configuration),
        },
      });
      return { decision, sources: context.sources, aiUsed: true };
    } catch (error) {
      if (error instanceof AiBudgetBlockedError)
        throw new BadRequestException(error.reason);
      throw error;
    }
  }
}

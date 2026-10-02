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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ConversationAiMode } from './entities/conversation.entity';
import { PipelineEventActor } from './entities/pipeline-event.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { InteractionSource } from '../interactions/entities/interaction.entity';

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
    @Query('language') language?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.findAll({
      stage,
      aiMode,
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
  approveKnowledge(@Param('id') id: string) {
    return this.conversationsService.approveKnowledge(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Patch(':id/mode')
  setMode(
    @Param('id') id: string,
    @Body() body: { aiMode: ConversationAiMode; reason?: string },
  ) {
    return this.conversationsService.setMode(id, body.aiMode, body.reason);
  }

  @Patch(':id/stage')
  setStage(
    @Param('id') id: string,
    @Body() body: { stage: PipelineStage; reason?: string },
  ) {
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
    @Body()
    body: {
      language?: string;
      optIn?: boolean;
      optOut?: boolean;
      summary?: string;
    },
  ) {
    return this.conversationsService.updateLead(id, body);
  }

  @Post(':id/send')
  async send(@Param('id') id: string, @Body() body: { text: string }) {
    const conversation = await this.conversationsService.findOne(id);
    await this.whatsAppService.sendText(
      conversation.externalContactKey,
      body.text,
      InteractionSource.HUMAN,
    );
    return this.conversationsService.findOne(id);
  }
}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from '../conversations/conversations.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { KnowledgeDocument } from '../knowledge/entities/knowledge-document.entity';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { AiConversationProcessor } from './ai-conversation.processor';
import { AiQueueService } from './ai-queue.service';
import { AiGuidanceService } from './ai-guidance.service';
import { AiGuidanceController } from './ai-guidance.controller';
import { BotInstruction } from './entities/bot-instruction.entity';
import { BotLearning } from './entities/bot-learning.entity';
import { BotControl } from './entities/bot-control.entity';
import { Interaction } from '../interactions/entities/interaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeDocument,
      BotInstruction,
      BotLearning,
      BotControl,
      Interaction,
    ]),
    ConversationsModule,
    forwardRef(() => WhatsAppModule),
  ],
  controllers: [AiGuidanceController],
  providers: [
    OpenAiService,
    WebKnowledgeService,
    AiConversationProcessor,
    AiQueueService,
    AiGuidanceService,
  ],
  exports: [AiQueueService, AiGuidanceService],
})
export class AiModule {}

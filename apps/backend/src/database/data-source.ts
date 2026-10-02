import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Interaction } from '../interactions/entities/interaction.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMessage } from '../conversations/entities/conversation-message.entity';
import { PipelineEvent } from '../conversations/entities/pipeline-event.entity';
import { KnowledgeDocument } from '../knowledge/entities/knowledge-document.entity';
import { BotControl } from '../ai/entities/bot-control.entity';
import { BotInstruction } from '../ai/entities/bot-instruction.entity';
import { BotLearning } from '../ai/entities/bot-learning.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Contact,
    Interaction,
    Conversation,
    ConversationMessage,
    PipelineEvent,
    KnowledgeDocument,
    BotControl,
    BotInstruction,
    BotLearning,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});

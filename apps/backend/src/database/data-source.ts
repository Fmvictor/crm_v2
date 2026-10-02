import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Interaction } from '../interactions/entities/interaction.entity';
import { Automation } from '../automations/entities/automation.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMessage } from '../conversations/entities/conversation-message.entity';
import { PipelineEvent } from '../conversations/entities/pipeline-event.entity';
import { KnowledgeDocument } from '../knowledge/entities/knowledge-document.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Contact, Course, Enrollment, Interaction, Automation, Conversation, ConversationMessage, PipelineEvent, KnowledgeDocument],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});

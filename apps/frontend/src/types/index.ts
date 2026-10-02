export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent' | 'viewer';
  isActive: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type PipelineStage = 'new' | 'contacted' | 'qualified' | 'call_scheduled' | 'call_done' | 'offer_sent' | 'deposit_requested' | 'deposit_paid' | 'enrolled' | 'nurture' | 'lost';

export interface Contact {
  id: string;
  name: string;
  courseInterest: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  lastPage: number;
}

export type ConversationAiMode = 'auto' | 'paused' | 'human';

export interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  actor: 'lead' | 'ai' | 'agent' | 'system';
  body: string;
  messageType: string;
  createdAt: string;
}

export interface PipelineEvent {
  id: string;
  fromStage: PipelineStage | null;
  toStage: PipelineStage;
  actor: 'ai' | 'agent' | 'system';
  reason: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  externalContactKey: string;
  pipelineStage: PipelineStage;
  aiMode: ConversationAiMode;
  language: string | null;
  optInAt: string | null;
  optOutAt: string | null;
  nextFollowUpAt: string | null;
  handoffReason: string | null;
  aiSummary: string | null;
  contact: Contact;
  messages?: ConversationMessage[];
  pipelineEvents?: PipelineEvent[];
  updatedAt: string;
}

export interface AiGuidanceConfiguration {
  instruction: string | null;
  paused: boolean;
}

export interface AiLearning {
  id: string;
  interactionId: string;
  status: 'pending' | 'approved' | 'rejected';
  category: string;
  candidateText: string | null;
  approvedText: string | null;
  createdAt: string;
}

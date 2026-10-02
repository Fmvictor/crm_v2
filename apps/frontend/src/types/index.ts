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

export type ContactStatus = 'new' | 'contacted' | 'qualified' | 'enrolled' | 'lost';
export type PipelineStage = 'new' | 'contacted' | 'qualified' | 'call_scheduled' | 'call_done' | 'offer_sent' | 'deposit_requested' | 'deposit_paid' | 'enrolled' | 'nurture' | 'lost';
export type ContactSource = 'whatsapp' | 'web' | 'referral' | 'social' | 'other';

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ContactStatus;
  pipelineStage: PipelineStage;
  source: ContactSource;
  courseInterest: string | null;
  notes: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  assignedTo: User | null;
  createdAt: string;
  updatedAt: string;
}

export type CourseStatus = 'draft' | 'active' | 'archived';
export type CourseModality = 'online' | 'in_person' | 'hybrid';

export interface Course {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  durationHours: number | null;
  durationDays: number | null;
  modality: CourseModality;
  status: CourseStatus;
  startDate: string | null;
  endDate: string | null;
  maxStudents: number | null;
  createdAt: string;
}

export type EnrollmentStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';

export interface Enrollment {
  id: string;
  contact: Contact;
  course: Course | null;
  status: EnrollmentStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number | null;
  amountTotal: number | null;
  enrolledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  stripePaymentId: string | null;
  currency: string | null;
  wooOrderNumber: string | null;
  createdAt: string;
}

export type AutomationTrigger = 'payment_captured';
export type AutomationAction = 'whatsapp_template';

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  action: AutomationAction;
  templateName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  lastPage: number;
}

export interface Interaction {
  id: string;
  type: 'call' | 'whatsapp' | 'email' | 'note' | 'meeting';
  direction: 'inbound' | 'outbound' | null;
  notes: string;
  durationMinutes: number | null;
  contact: Contact;
  contactId: string;
  createdBy: User | null;
  createdById: string | null;
  createdAt: string;
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

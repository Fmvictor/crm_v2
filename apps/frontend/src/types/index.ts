export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  isActive: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type ContactStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "enrolled"
  | "lost";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  status: ContactStatus;
  notes: string | null;
  botPaused: boolean;
  botMemory: string | null;
  botMemoryExpiresAt: string | null;
  assignedTo: User | null;
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
  type: "whatsapp";
  direction: "inbound" | "outbound" | null;
  notes: string;
  contact: Contact;
  contactId: string;
  createdBy: User | null;
  createdAt: string;
}

export interface BotJob {
  id: string;
  contactId: string;
  status: "pending" | "processing" | "draft" | "sent" | "needs_human" | "resolved" | "failed";
  answer: string | null;
  reason: string | null;
  sourceUrl: string | null;
  sourceFetchedAt: string | null;
  createdAt: string;
}

export interface BotLearning {
  id: string;
  status: "pending" | "approved" | "rejected";
  category: "style" | "process";
  approvedText: string | null;
  interaction: Interaction;
  createdAt: string;
}

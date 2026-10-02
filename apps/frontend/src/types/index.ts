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

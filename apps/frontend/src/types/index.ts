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
export type ContactSource = 'whatsapp' | 'web' | 'referral' | 'social' | 'other';

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ContactStatus;
  source: ContactSource;
  courseInterest: string | null;
  notes: string | null;
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
  course: Course;
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

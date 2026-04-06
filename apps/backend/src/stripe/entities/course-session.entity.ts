import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';

export interface SessionStudent {
  name: string;
  email: string | null;
  contactId: string;
  stripePaymentId: string;
  enrolledAt: string;
}

@Entity('course_sessions')
export class CourseSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Course, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @Column()
  courseId: string;

  @Column({ length: 150 })
  courseName: string;

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'jsonb', default: [] })
  students: SessionStudent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

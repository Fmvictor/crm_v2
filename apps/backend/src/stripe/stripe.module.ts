import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { Contact } from '../contacts/entities/contact.entity';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { CourseSession } from './entities/course-session.entity';
import { AutomationsModule } from '../automations/automations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, Course, Enrollment, CourseSession]), AutomationsModule],
  controllers: [StripeController],
  providers: [StripeService],
})
export class StripeModule {}

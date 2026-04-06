import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ContactsModule } from './contacts/contacts.module';
import { CoursesModule } from './courses/courses.module';
import { InteractionsModule } from './interactions/interactions.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { StripeModule } from './stripe/stripe.module';
import { AutomationsModule } from './automations/automations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    DatabaseModule,
    UsersModule,
    AuthModule,
    ContactsModule,
    CoursesModule,
    InteractionsModule,
    EnrollmentsModule,
    StripeModule,
    AutomationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

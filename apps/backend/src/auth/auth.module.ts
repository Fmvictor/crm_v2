import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

const RedisProvider = {
  provide: 'REDIS_CLIENT',
  useFactory: (config: ConfigService) => new Redis(config.getOrThrow('REDIS_URL')),
  inject: [ConfigService],
};

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // secrets se inyectan por estrategia
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, RedisProvider],
})
export class AuthModule {}

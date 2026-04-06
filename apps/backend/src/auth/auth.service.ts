import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { Redis } from 'ioredis';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    return this.generateTokens(user);
  }

  async refresh(user: User, oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const oldHash = this.hashToken(oldRefreshToken);
    const key = `refresh:${user.id}:${oldHash}`;
    const exists = await this.redis.exists(key);
    if (!exists) throw new UnauthorizedException('Refresh token inválido o revocado');

    await this.redis.del(key);
    return this.generateTokens(user);
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (!refreshToken) return;
    const hash = this.hashToken(refreshToken);
    await this.redis.del(`refresh:${userId}:${hash}`);
  }

  me(user: User): User {
    return user;
  }

  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      expiresIn: '1h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });

    const hash = this.hashToken(refreshToken);
    await this.redis.set(`refresh:${user.id}:${hash}`, '1', 'EX', REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

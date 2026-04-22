import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { StringValue } from 'ms';
import { FirebaseService } from '../firebase/firebase.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { User } from '../users/entities/user.entity';
import type { DecodedIdToken } from 'firebase-admin/auth';

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

interface RefreshPayload {
    sub: string;
    tokenId: string;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly firebaseService: FirebaseService,
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
    ) { }

    async verifyFirebaseToken(idToken: string) {
        let decoded: DecodedIdToken;
        try {
            decoded = await this.firebaseService.getAuth().verifyIdToken(idToken);
        } catch (err: unknown) {
            const firebaseErr = err as { errorInfo?: { code: string } };
            const code = firebaseErr?.errorInfo?.code ?? '';
            if (code === 'auth/id-token-expired') {
                throw new UnauthorizedException('Firebase token has expired. Please sign in again.');
            }
            if (code === 'auth/id-token-revoked') {
                throw new UnauthorizedException('Firebase token has been revoked. Please sign in again.');
            }
            if (code.startsWith('auth/')) {
                throw new UnauthorizedException('Invalid Firebase token. Please sign in again.');
            }
            this.logger.error('Firebase token verification failed', err);
            throw new InternalServerErrorException('Authentication service unavailable. Please try again.');
        }

        const phone = decoded.phone_number;
        if (!phone) {
            throw new BadRequestException('Firebase token does not contain a phone number. Use phone authentication.');
        }

        const user = await this.usersService.upsertByPhone(phone);
        return this.generateTokens(user);
    }

    async refresh(refreshToken: string) {
        let payload: RefreshPayload;
        try {
            payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
                secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
            });
        } catch {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const key = `refresh_token:${payload.sub}:${payload.tokenId}`;
        const stored = await this.redisService.get(key);
        if (!stored) {
            throw new UnauthorizedException('Refresh token has been revoked');
        }

        // Rotate token
        await this.redisService.del(key);
        const user = await this.usersService.findById(payload.sub);
        if (!user) throw new UnauthorizedException('User not found');
        return this.generateTokens(user);
    }

    async logout(refreshToken: string): Promise<void> {
        try {
            const payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
                secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
            });
            await this.redisService.del(
                `refresh_token:${payload.sub}:${payload.tokenId}`,
            );
        } catch {
            // Token already invalid — nothing to do
        }
    }

    private async generateTokens(user: User) {
        const tokenId = uuidv4();

        const accessToken = this.jwtService.sign(
            { sub: user.id, phone: user.phone, role: user.role },
            {
                expiresIn: this.configService.get<string>(
                    'JWT_EXPIRES_IN',
                    '15m',
                ) as StringValue,
            },
        );

        const refreshToken = this.jwtService.sign(
            { sub: user.id, tokenId },
            {
                secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
                expiresIn: this.configService.get<string>(
                    'REFRESH_TOKEN_EXPIRES_IN',
                    '30d',
                ) as StringValue,
            },
        );

        await this.redisService.set(
            `refresh_token:${user.id}:${tokenId}`,
            'valid',
            REFRESH_TTL_SECONDS,
        );

        return { accessToken, refreshToken, user };
    }
}

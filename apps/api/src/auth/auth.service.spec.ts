import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import {
    UnauthorizedException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { User, UserRole } from '../users/entities/user.entity';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser: User = {
    id: 'user-uuid-123',
    phone: '+971500000000',
    name: null,
    email: null,
    role: UserRole.CUSTOMER,
    fcmToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockFirebaseService = {
    getAuth: jest.fn().mockReturnValue({
        verifyIdToken: jest.fn(),
    }),
};

const mockUsersService = {
    upsertByPhone: jest.fn(),
    findById: jest.fn(),
};

const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
};

const mockConfigService = {
    get: jest.fn((key: string, fallback?: string) => {
        const config: Record<string, string> = {
            JWT_SECRET: 'test-jwt-secret',
            JWT_EXPIRES_IN: '15m',
            REFRESH_TOKEN_SECRET: 'test-refresh-secret',
            REFRESH_TOKEN_EXPIRES_IN: '30d',
        };
        return config[key] ?? fallback;
    }),
};

const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
    let service: AuthService;
    let firebaseAuth: { verifyIdToken: jest.Mock };

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: FirebaseService, useValue: mockFirebaseService },
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: RedisService, useValue: mockRedisService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        firebaseAuth = mockFirebaseService.getAuth();
    });

    // ── verifyFirebaseToken ──────────────────────────────────────────────────

    describe('verifyFirebaseToken', () => {
        it('should return tokens and user on valid Firebase token with phone', async () => {
            firebaseAuth.verifyIdToken.mockResolvedValue({
                uid: 'firebase-uid',
                phone_number: '+971500000000',
            });
            mockUsersService.upsertByPhone.mockResolvedValue(mockUser);
            mockJwtService.sign
                .mockReturnValueOnce('access-token-value')
                .mockReturnValueOnce('refresh-token-value');
            mockRedisService.set.mockResolvedValue(undefined);

            const result = await service.verifyFirebaseToken('valid-firebase-id-token');

            expect(firebaseAuth.verifyIdToken).toHaveBeenCalledWith('valid-firebase-id-token');
            expect(mockUsersService.upsertByPhone).toHaveBeenCalledWith('+971500000000');
            expect(result.accessToken).toBe('access-token-value');
            expect(result.refreshToken).toBe('refresh-token-value');
            expect(result.user).toEqual(mockUser);
            expect(mockRedisService.set).toHaveBeenCalledWith(
                expect.stringMatching(/^refresh_token:user-uuid-123:/),
                'valid',
                2592000,
            );
        });

        it('should throw UnauthorizedException on expired Firebase token', async () => {
            firebaseAuth.verifyIdToken.mockRejectedValue({
                errorInfo: { code: 'auth/id-token-expired' },
            });

            await expect(service.verifyFirebaseToken('expired-token')).rejects.toThrow(
                UnauthorizedException,
            );
            await expect(service.verifyFirebaseToken('expired-token')).rejects.toThrow(
                /expired/i,
            );
        });

        it('should throw UnauthorizedException on revoked Firebase token', async () => {
            firebaseAuth.verifyIdToken.mockRejectedValue({
                errorInfo: { code: 'auth/id-token-revoked' },
            });

            await expect(service.verifyFirebaseToken('revoked-token')).rejects.toThrow(
                UnauthorizedException,
            );
            await expect(service.verifyFirebaseToken('revoked-token')).rejects.toThrow(
                /revoked/i,
            );
        });

        it('should throw UnauthorizedException on any auth/ Firebase error', async () => {
            firebaseAuth.verifyIdToken.mockRejectedValue({
                errorInfo: { code: 'auth/invalid-id-token' },
            });

            await expect(service.verifyFirebaseToken('bad-token')).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw InternalServerErrorException on non-Firebase errors', async () => {
            firebaseAuth.verifyIdToken.mockRejectedValue(new Error('Network error'));

            await expect(service.verifyFirebaseToken('token')).rejects.toThrow(
                InternalServerErrorException,
            );
        });

        it('should throw BadRequestException when Firebase token has no phone_number', async () => {
            firebaseAuth.verifyIdToken.mockResolvedValue({
                uid: 'firebase-uid',
                // No phone_number — email auth token
            });

            await expect(service.verifyFirebaseToken('email-token')).rejects.toThrow(
                BadRequestException,
            );
            await expect(service.verifyFirebaseToken('email-token')).rejects.toThrow(
                /phone/i,
            );
        });
    });

    // ── refresh ──────────────────────────────────────────────────────────────

    describe('refresh', () => {
        it('should rotate tokens on valid refresh token', async () => {
            const payload = { sub: 'user-uuid-123', tokenId: 'token-id-abc' };
            mockJwtService.verify.mockReturnValue(payload);
            mockRedisService.get.mockResolvedValue('valid');
            mockRedisService.del.mockResolvedValue(undefined);
            mockUsersService.findById.mockResolvedValue(mockUser);
            mockJwtService.sign
                .mockReturnValueOnce('new-access-token')
                .mockReturnValueOnce('new-refresh-token');
            mockRedisService.set.mockResolvedValue(undefined);

            const result = await service.refresh('valid-refresh-token');

            expect(mockRedisService.del).toHaveBeenCalledWith(
                'refresh_token:user-uuid-123:token-id-abc',
            );
            expect(result.accessToken).toBe('new-access-token');
            expect(result.refreshToken).toBe('new-refresh-token');
        });

        it('should throw UnauthorizedException on invalid refresh token signature', async () => {
            mockJwtService.verify.mockImplementation(() => {
                throw new Error('jwt malformed');
            });

            await expect(service.refresh('bad-token')).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException when refresh token not found in Redis (revoked)', async () => {
            mockJwtService.verify.mockReturnValue({
                sub: 'user-uuid-123',
                tokenId: 'token-id-abc',
            });
            mockRedisService.get.mockResolvedValue(null); // not in Redis

            await expect(service.refresh('revoked-refresh')).rejects.toThrow(
                UnauthorizedException,
            );
            await expect(service.refresh('revoked-refresh')).rejects.toThrow(
                /revoked/i,
            );
        });

        it('should throw UnauthorizedException when user no longer exists', async () => {
            mockJwtService.verify.mockReturnValue({
                sub: 'deleted-user',
                tokenId: 'token-id',
            });
            mockRedisService.get.mockResolvedValue('valid');
            mockRedisService.del.mockResolvedValue(undefined);
            mockUsersService.findById.mockResolvedValue(null);

            await expect(service.refresh('orphan-token')).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    // ── logout ───────────────────────────────────────────────────────────────

    describe('logout', () => {
        it('should delete Redis key on valid refresh token', async () => {
            mockJwtService.verify.mockReturnValue({
                sub: 'user-uuid-123',
                tokenId: 'token-id-abc',
            });
            mockRedisService.del.mockResolvedValue(undefined);

            await service.logout('valid-refresh-token');

            expect(mockRedisService.del).toHaveBeenCalledWith(
                'refresh_token:user-uuid-123:token-id-abc',
            );
        });

        it('should silently succeed on invalid/expired refresh token (idempotent logout)', async () => {
            mockJwtService.verify.mockImplementation(() => {
                throw new Error('jwt expired');
            });

            await expect(service.logout('expired-token')).resolves.not.toThrow();
        });
    });
});

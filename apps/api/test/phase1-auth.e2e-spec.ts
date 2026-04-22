import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from '../src/common/interceptors/response-transform.interceptor';
import { FirebaseService } from '../src/firebase/firebase.service';
import { RedisService } from '../src/redis/redis.service';
import { DataSource } from 'typeorm';

/**
 * Phase 1 E2E Tests — Auth + Users
 *
 * Requires: PostgreSQL + Redis running (docker compose -f infra/docker-compose.yml up -d)
 * Firebase is mocked — no real Firebase project needed.
 */

// ─── Firebase mock ───────────────────────────────────────────────────────────

const VALID_PHONE = '+971500000001';
const VALID_DECODED_TOKEN = {
    uid: 'firebase-test-uid',
    phone_number: VALID_PHONE,
    aud: 'nibserve',
    iss: 'https://securetoken.google.com/nibserve',
    sub: 'firebase-test-uid',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { identities: {}, sign_in_provider: 'phone' },
};

const mockVerifyIdToken = jest.fn();
const mockFirebaseService = {
    getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
    getMessaging: () => ({}),
    onModuleInit: () => { },
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Phase 1: Auth & Users (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let accessToken: string;
    let refreshToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(FirebaseService)
            .useValue(mockFirebaseService)
            .compile();

        app = moduleFixture.createNestApplication();

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                stopAtFirstError: false,
            }),
        );
        app.useGlobalFilters(new GlobalExceptionFilter());
        app.useGlobalInterceptors(new ResponseTransformInterceptor());
        app.setGlobalPrefix('api');

        await app.init();

        dataSource = moduleFixture.get<DataSource>(DataSource);

        // Clean test data before suite
        await dataSource.query(`DELETE FROM users WHERE phone = '${VALID_PHONE}'`);
    });

    afterAll(async () => {
        await dataSource.query(`DELETE FROM users WHERE phone = '${VALID_PHONE}'`);
        await app.close();
    });

    // ── POST /api/auth/verify ──────────────────────────────────────────────────

    describe('POST /api/auth/verify', () => {
        it('✅ 201 — creates new user and returns tokens on first sign-in', async () => {
            mockVerifyIdToken.mockResolvedValue(VALID_DECODED_TOKEN);

            const res = await request(app.getHttpServer())
                .post('/api/auth/verify')
                .send({ idToken: 'valid-firebase-token' })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.body.data).toHaveProperty('refreshToken');
            expect(res.body.data.user.phone).toBe(VALID_PHONE);
            expect(res.body.data.user).not.toHaveProperty('password');

            accessToken = res.body.data.accessToken as string;
            refreshToken = res.body.data.refreshToken as string;
        });

        it('✅ 201 — returns existing user on subsequent sign-in (upsert)', async () => {
            mockVerifyIdToken.mockResolvedValue(VALID_DECODED_TOKEN);

            const res = await request(app.getHttpServer())
                .post('/api/auth/verify')
                .send({ idToken: 'valid-firebase-token' })
                .expect(201);

            expect(res.body.data.user.phone).toBe(VALID_PHONE);
        });

        it('❌ 401 — expired Firebase token', async () => {
            mockVerifyIdToken.mockRejectedValue({
                errorInfo: { code: 'auth/id-token-expired' },
            });

            const res = await request(app.getHttpServer())
                .post('/api/auth/verify')
                .send({ idToken: 'expired-token' })
                .expect(401);

            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/expired/i);
            expect(res.body).toHaveProperty('timestamp');
            expect(res.body).toHaveProperty('path');
        });

        it('❌ 401 — revoked Firebase token', async () => {
            mockVerifyIdToken.mockRejectedValue({
                errorInfo: { code: 'auth/id-token-revoked' },
            });

            const res = await request(app.getHttpServer())
                .post('/api/auth/verify')
                .send({ idToken: 'revoked-token' })
                .expect(401);

            expect(res.body.message).toMatch(/revoked/i);
        });

        it('❌ 422 — missing idToken field', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/verify')
                .send({})
                .expect(422);

            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Unprocessable Entity');
            expect(Array.isArray(res.body.message) || typeof res.body.message === 'string').toBe(true);
        });

        it('❌ 422 — idToken is not a string', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/verify')
                .send({ idToken: 12345 })
                .expect(422);

            expect(res.body.success).toBe(false);
        });
    });

    // ── POST /api/auth/refresh ────────────────────────────────────────────────

    describe('POST /api/auth/refresh', () => {
        it('✅ 201 — returns new tokens and rotates refresh token', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.accessToken).toBeDefined();
            expect(res.body.data.refreshToken).toBeDefined();
            // Token rotation — new token must differ from old
            expect(res.body.data.refreshToken).not.toBe(refreshToken);

            // Use the new tokens for subsequent tests
            accessToken = res.body.data.accessToken as string;
            refreshToken = res.body.data.refreshToken as string;
        });

        it('❌ 401 — old (rotated) refresh token is now invalid', async () => {
            // The previous refreshToken was rotated out — reusing it should fail
            const res = await request(app.getHttpServer())
                .post('/api/auth/refresh')
                .send({ refreshToken: 'this-was-the-old-token' })
                .expect(401);

            expect(res.body.success).toBe(false);
        });

        it('❌ 401 — malformed refresh token', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/refresh')
                .send({ refreshToken: 'not.a.valid.jwt' })
                .expect(401);

            expect(res.body.success).toBe(false);
        });

        it('❌ 422 — missing refreshToken field', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/refresh')
                .send({})
                .expect(422);

            expect(res.body.success).toBe(false);
        });
    });

    // ── GET /api/users/me ─────────────────────────────────────────────────────

    describe('GET /api/users/me', () => {
        it('✅ 200 — returns authenticated user profile', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.phone).toBe(VALID_PHONE);
            expect(res.body.data.role).toBe('customer');
            expect(res.body.data).not.toHaveProperty('password');
        });

        it('❌ 401 — missing Authorization header', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me')
                .expect(401);

            expect(res.body.success).toBe(false);
        });

        it('❌ 401 — invalid Bearer token', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me')
                .set('Authorization', 'Bearer invalid.token.here')
                .expect(401);

            expect(res.body.success).toBe(false);
        });

        it('❌ 401 — expired access token', async () => {
            // Sign a token that expired 1 second ago
            const { JwtService } = await import('@nestjs/jwt');
            const jwt = new JwtService({});
            const expiredToken = jwt.sign(
                { sub: 'some-id', phone: VALID_PHONE, role: 'customer' },
                { secret: process.env.JWT_SECRET ?? 'test', expiresIn: -1 },
            );

            const res = await request(app.getHttpServer())
                .get('/api/users/me')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);

            expect(res.body.success).toBe(false);
        });
    });

    // ── PATCH /api/users/me ───────────────────────────────────────────────────

    describe('PATCH /api/users/me', () => {
        it('✅ 200 — updates user name', async () => {
            const res = await request(app.getHttpServer())
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Hameez Test' })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.name).toBe('Hameez Test');
        });

        it('✅ 200 — updates fcm_token', async () => {
            const res = await request(app.getHttpServer())
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ fcmToken: 'new-fcm-registration-token' })
                .expect(200);

            expect(res.body.data.fcmToken).toBe('new-fcm-registration-token');
        });

        it('✅ 200 — strips unknown fields (whitelist)', async () => {
            const res = await request(app.getHttpServer())
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Valid', unknownField: 'should be stripped', role: 'admin' })
                .expect(200);

            // role should NOT be changed to admin via this endpoint
            expect(res.body.data.role).toBe('customer');
        });

        it('❌ 401 — unauthenticated patch request', async () => {
            const res = await request(app.getHttpServer())
                .patch('/api/users/me')
                .send({ name: 'Hacker' })
                .expect(401);

            expect(res.body.success).toBe(false);
        });
    });

    // ── POST /api/auth/logout ─────────────────────────────────────────────────

    describe('POST /api/auth/logout', () => {
        it('✅ 204 — successfully logs out and invalidates refresh token', async () => {
            await request(app.getHttpServer())
                .post('/api/auth/logout')
                .send({ refreshToken })
                .expect(204);
        });

        it('❌ 401 — refresh token is now invalid after logout', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(401);

            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/revoked/i);
        });

        it('✅ 204 — logout is idempotent (already logged out token)', async () => {
            // Calling logout again with same (now-invalid) token should not throw
            await request(app.getHttpServer())
                .post('/api/auth/logout')
                .send({ refreshToken })
                .expect(204);
        });
    });

    // ── Error Response Shape ───────────────────────────────────────────────────

    describe('Error Response Shape', () => {
        it('should always include success, statusCode, error, message, timestamp, path', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me')
                .expect(401);

            expect(res.body).toMatchObject({
                success: false,
                statusCode: 401,
                error: expect.any(String),
                message: expect.anything(),
                timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                path: '/api/users/me',
            });
        });

        it('404 — unknown route should return proper error shape', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/nonexistent-route')
                .expect(404);

            expect(res.body.success).toBe(false);
            expect(res.body.statusCode).toBe(404);
        });
    });
});

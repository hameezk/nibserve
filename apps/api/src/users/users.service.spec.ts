import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from './entities/user.entity';
import { Repository } from 'typeorm';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser: User = {
    id: 'user-uuid-123',
    phone: '+971500000000',
    name: 'Test User',
    email: 'test@example.com',
    role: UserRole.CUSTOMER,
    fcmToken: 'fcm-token-abc',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
    let service: UsersService;
    let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'create' | 'save' | 'update'>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: getRepositoryToken(User), useValue: mockRepository },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
        repo = mockRepository as typeof repo;
    });

    describe('findById', () => {
        it('should return a user when found', async () => {
            repo.findOne.mockResolvedValue(mockUser);
            const result = await service.findById('user-uuid-123');
            expect(result).toEqual(mockUser);
            expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'user-uuid-123' } });
        });

        it('should return null when user not found', async () => {
            repo.findOne.mockResolvedValue(null);
            const result = await service.findById('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('findByPhone', () => {
        it('should return a user by phone', async () => {
            repo.findOne.mockResolvedValue(mockUser);
            const result = await service.findByPhone('+971500000000');
            expect(result).toEqual(mockUser);
            expect(repo.findOne).toHaveBeenCalledWith({ where: { phone: '+971500000000' } });
        });
    });

    describe('upsertByPhone', () => {
        it('should return existing user if phone already exists', async () => {
            repo.findOne.mockResolvedValue(mockUser);

            const result = await service.upsertByPhone('+971500000000');

            expect(result).toEqual(mockUser);
            expect(repo.create).not.toHaveBeenCalled();
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('should create and return new user if phone does not exist', async () => {
            repo.findOne.mockResolvedValue(null);
            const newUser = { ...mockUser, name: null, email: null };
            repo.create.mockReturnValue(newUser);
            repo.save.mockResolvedValue(newUser);

            const result = await service.upsertByPhone('+971509999999');

            expect(repo.create).toHaveBeenCalledWith({
                phone: '+971509999999',
                role: UserRole.CUSTOMER,
            });
            expect(repo.save).toHaveBeenCalled();
            expect(result).toEqual(newUser);
        });
    });

    describe('update', () => {
        it('should update name and return updated user', async () => {
            repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
            repo.findOne.mockResolvedValue({ ...mockUser, name: 'New Name' });

            const result = await service.update('user-uuid-123', { name: 'New Name' });

            expect(repo.update).toHaveBeenCalledWith('user-uuid-123', { name: 'New Name' });
            expect(result?.name).toBe('New Name');
        });

        it('should update fcmToken', async () => {
            repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
            repo.findOne.mockResolvedValue({ ...mockUser, fcmToken: 'new-fcm-token' });

            const result = await service.update('user-uuid-123', { fcmToken: 'new-fcm-token' });

            expect(repo.update).toHaveBeenCalledWith('user-uuid-123', { fcmToken: 'new-fcm-token' });
            expect(result?.fcmToken).toBe('new-fcm-token');
        });

        it('should not include undefined fields in the update payload', async () => {
            repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
            repo.findOne.mockResolvedValue(mockUser);

            await service.update('user-uuid-123', { name: 'Only Name' });

            // email and fcmToken are undefined in dto — should NOT be in update call
            expect(repo.update).toHaveBeenCalledWith('user-uuid-123', { name: 'Only Name' });
        });
    });
});

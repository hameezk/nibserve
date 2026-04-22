import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly usersRepo: Repository<User>,
    ) { }

    async findById(id: string): Promise<User | null> {
        return this.usersRepo.findOne({ where: { id } });
    }

    async findByPhone(phone: string): Promise<User | null> {
        return this.usersRepo.findOne({ where: { phone } });
    }

    async upsertByPhone(phone: string): Promise<User> {
        let user = await this.findByPhone(phone);
        if (!user) {
            user = this.usersRepo.create({ phone, role: UserRole.CUSTOMER });
            await this.usersRepo.save(user);
        }
        return user;
    }

    async update(id: string, dto: UpdateUserDto): Promise<User | null> {
        await this.usersRepo.update(id, {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.email !== undefined && { email: dto.email }),
            ...(dto.fcmToken !== undefined && { fcmToken: dto.fcmToken }),
        });
        return this.findById(id);
    }
}

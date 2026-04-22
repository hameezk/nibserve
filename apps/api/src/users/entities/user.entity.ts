import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
    CUSTOMER = 'customer',
    DRIVER = 'driver',
    RESTAURANT_OWNER = 'restaurant_owner',
    ADMIN = 'admin',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    phone: string;

    @Column({ nullable: true, type: 'varchar' })
    name: string | null;

    @Column({ nullable: true, type: 'varchar' })
    email: string | null;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
    role: UserRole;

    @Column({ name: 'fcm_token', nullable: true, type: 'varchar' })
    fcmToken: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

@Injectable()
export class RedisService {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) { }

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        await this.redis.set(key, value, 'EX', ttlSeconds);
    }

    async get(key: string): Promise<string | null> {
        return this.redis.get(key);
    }

    async del(key: string): Promise<void> {
        await this.redis.del(key);
    }

    async keys(pattern: string): Promise<string[]> {
        return this.redis.keys(pattern);
    }
}

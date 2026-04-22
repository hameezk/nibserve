import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

export interface ApiSuccessResponse<T> {
    success: true;
    statusCode: number;
    data: T;
    timestamp: string;
    path: string;
}

@Injectable()
export class ResponseTransformInterceptor<T>
    implements NestInterceptor<T, ApiSuccessResponse<T> | void> {
    intercept(
        context: ExecutionContext,
        next: CallHandler<T>,
    ): Observable<ApiSuccessResponse<T> | void> {
        const ctx = context.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<{ statusCode: number }>();

        return next.handle().pipe(
            map((data) => {
                // 204 No Content — don't wrap
                if (response.statusCode === 204 || data === undefined || data === null) {
                    return undefined;
                }
                return {
                    success: true as const,
                    statusCode: response.statusCode,
                    data,
                    timestamp: new Date().toISOString(),
                    path: request.url,
                };
            }),
        );
    }
}

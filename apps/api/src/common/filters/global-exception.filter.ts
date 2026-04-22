import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

export interface ApiErrorResponse {
    success: false;
    statusCode: number;
    error: string;
    message: string | string[];
    timestamp: string;
    path: string;
    requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        let error = 'Internal Server Error';
        let message: string | string[] = 'An unexpected error occurred';

        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
                error = exception.name;
            } else if (typeof exceptionResponse === 'object') {
                const obj = exceptionResponse as Record<string, unknown>;
                // NestJS ValidationPipe returns { message: string[], error: string }
                message = (obj.message as string | string[]) ?? exception.message;
                error = (obj.error as string) ?? exception.name;
            }
        } else if (exception instanceof QueryFailedError) {
            // TypeORM / PostgreSQL errors
            const pgError = exception as QueryFailedError & { code?: string; detail?: string };
            statusCode = HttpStatus.CONFLICT;

            if (pgError.code === '23505') {
                error = 'Conflict';
                // Extract field name from detail like "Key (phone)=(+971...) already exists"
                const match = pgError.detail?.match(/Key \((.+?)\)/);
                const field = match ? match[1] : 'field';
                message = `A record with this ${field} already exists`;
            } else if (pgError.code === '23503') {
                error = 'Bad Request';
                statusCode = HttpStatus.BAD_REQUEST;
                message = 'Referenced record does not exist';
            } else {
                statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
                error = 'Database Error';
                message = 'A database error occurred';
            }
        } else if (exception instanceof Error) {
            // Firebase errors
            const firebaseError = exception as Error & { code?: string; errorInfo?: { code: string; message: string } };
            if (firebaseError.errorInfo) {
                statusCode = HttpStatus.UNAUTHORIZED;
                error = 'Unauthorized';
                message = mapFirebaseError(firebaseError.errorInfo.code);
            } else {
                this.logger.error(exception.message, exception.stack);
            }
        } else {
            this.logger.error('Unknown exception', JSON.stringify(exception));
        }

        // Don't leak stack traces in production
        if (
            statusCode === HttpStatus.INTERNAL_SERVER_ERROR &&
            process.env.NODE_ENV !== 'development'
        ) {
            message = 'An unexpected error occurred. Please try again later.';
        } else if (statusCode >= 500) {
            this.logger.error(
                `${request.method} ${request.url} → ${statusCode}`,
                exception instanceof Error ? exception.stack : JSON.stringify(exception),
            );
        }

        const body: ApiErrorResponse = {
            success: false,
            statusCode,
            error,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
        };

        response.status(statusCode).json(body);
    }
}

function mapFirebaseError(code: string): string {
    const map: Record<string, string> = {
        'auth/id-token-expired': 'Firebase token has expired. Please sign in again.',
        'auth/id-token-revoked': 'Firebase token has been revoked. Please sign in again.',
        'auth/invalid-id-token': 'Invalid Firebase token. Please sign in again.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account found with this credential.',
        'auth/argument-error': 'Malformed authentication token.',
        'auth/project-not-found': 'Firebase project configuration error.',
    };
    return map[code] ?? `Authentication error: ${code}`;
}

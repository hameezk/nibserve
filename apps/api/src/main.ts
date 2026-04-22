import { NestFactory } from '@nestjs/core';
import { ValidationPipe, HttpStatus } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe — returns 422 with field-level errors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      stopAtFirstError: false,
    }),
  );

  // Global exception filter — consistent error shape for frontend
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global response wrapper — consistent success shape
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  app.enableCors();
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`NibServe API running on port ${port}`);
}
void bootstrap();

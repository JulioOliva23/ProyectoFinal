import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createValidationPipe } from './common/validation/validation-messages';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a hosting proxy (Render) every request comes from the proxy's IP;
  // trust one hop so the login/tracking throttlers limit per client, not globally.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // BE-E09: CORS allowlist from CORS_ORIGINS (comma-separated). Defaults to
  // reflecting any origin for local development; set the variable to lock the
  // accepted origins in production. `credentials` lets the frontend send
  // cookies (withCredentials), needed for the httpOnly refresh cookie (SUP-07).
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true, credentials: true });

  // BE-11: strict global validation pipe.
  app.useGlobalPipes(
    createValidationPipe(),
  );

  // Run onModuleDestroy on SIGTERM/SIGINT so PrismaService closes its
  // connections when the host restarts the service.
  app.enableShutdownHooks();

  // BE-22: versioned REST API base path.
  app.setGlobalPrefix('api/v1');

  // BE-25: OpenAPI / Swagger documentation.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Phone Repair Service API')
    .setDescription('Backend API for the mobile phone technical service management system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Keep Swagger outside the versioned API prefix so it is available at /api.
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { AuthenticatedIoAdapter } from './auth/ws-auth.adapter';
import { MissingEnvVarError, isPermissiveCors, parseCorsOrigins } from './config/env';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // O nginx faz proxy a partir de 127.0.0.1 e manda o IP real em X-Forwarded-For. Sem
  // isto o rate limit de /auth/login enxergaria todas as tentativas vindas do mesmo IP
  // (o do próprio proxy), e um atacante bloquearia o login de todo mundo.
  app.set('trust proxy', 'loopback');

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  if (isPermissiveCors(corsOrigins)) {
    logger.warn(
      'CORS_ORIGINS não está definido — a API aceita requisições de qualquer origem. ' +
        'Defina CORS_ORIGINS=https://painel.seudominio.com em backend/.env.',
    );
  } else {
    logger.log(`CORS restrito a: ${corsOrigins.join(', ')}`);
  }

  // Exige JWT válido no handshake dos WebSockets. Sem isto, `terminal:init` entregava um
  // shell no usuário do backend para qualquer socket anônimo.
  app.useWebSocketAdapter(new AuthenticatedIoAdapter(app, corsOrigins));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Campo desconhecido agora vira 400 em vez de sumir calado. Era assim que o bug do
      // PUT /api/apps/:id passava despercebido: o body inteiro era descartado e a API
      // respondia 200 sem salvar nada.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Trilha de auditoria de tudo que altera estado. Global de propósito: auditoria que
  // depende de alguém lembrar de chamar o serviço fica incompleta na primeira feature
  // nova, e uma trilha com buracos dá falsa sensação de cobertura.
  app.useGlobalInterceptors(new AuditInterceptor(app.get(AuditService)));

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 10001;
  await app.listen(port);
  logger.log(`🚀 DeployHub Backend running on port ${port}`);
}

bootstrap().catch((error) => {
  if (error instanceof MissingEnvVarError) {
    // Mensagem limpa e acionável em vez de um stack trace do Nest.
    console.error(`\n❌ Configuração inválida\n\n${error.message}\n`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { parseEncryptionKey } from '../common/crypto';
import { createEnvEncryptionMiddleware } from './env-encryption';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  constructor() {
    super();

    // Criptografia de `App.envVars` e `Project.envVars` em repouso.
    //
    // Sem ENV_ENCRYPTION_KEY a criptografia fica desligada e tudo segue funcionando com
    // os valores em texto puro — instalações existentes não quebram no update. O
    // update.sh gera a chave quando ela falta, então na prática isso só acontece em
    // ambiente de desenvolvimento.
    //
    // Uma chave presente mas malformada lança: seguir em frente gravaria segredo em
    // texto puro enquanto o operador acha que está protegido.
    const key = parseEncryptionKey(process.env.ENV_ENCRYPTION_KEY);
    // O cast existe porque env-encryption.ts declara o formato dos params por conta
    // própria, para não depender dos tipos gerados do Prisma (o node --test importa
    // aquele arquivo direto). A forma é a mesma; só o tipo de `model` é mais largo.
    this.$use(createEnvEncryptionMiddleware(key) as Parameters<PrismaClient['$use']>[0]);

    if (key) {
      this.logger.log('Criptografia das variáveis de ambiente ativa (AES-256-GCM)');
    } else {
      this.logger.warn(
        'ENV_ENCRYPTION_KEY não definida — as variáveis de ambiente dos apps ficam em texto puro no banco. ' +
          'Gere uma com: openssl rand -hex 32',
      );
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

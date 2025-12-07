import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DeployService } from '../deploy/deploy.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhookService {
  constructor(
    private prisma: PrismaService,
    private deployService: DeployService,
  ) { }

  async handleGitHubWebhook(appName: string, signature: string, event: string, payload: any) {
    const app = await this.prisma.app.findUnique({ where: { name: appName } });

    if (!app) {
      throw new BadRequestException('App não encontrado');
    }

    // Verify signature
    if (app.webhookSecret) {
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', app.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new UnauthorizedException('Assinatura inválida');
      }
    }

    // Only handle push events
    if (event !== 'push') {
      return { message: `Evento ${event} ignorado` };
    }

    // Check if push is to the configured branch
    const ref = payload.ref || '';
    const branch = ref.replace('refs/heads/', '');

    if (branch !== app.branch) {
      return { message: `Push para branch ${branch} ignorado (configurado: ${app.branch})` };
    }

    // Log webhook received
    await this.prisma.systemLog.create({
      data: {
        level: 'info',
        message: `Webhook recebido para ${appName}: ${payload.head_commit?.message || 'sem mensagem'}`,
        source: 'github',
        appId: app.id,
      },
    });

    // Trigger deploy
    const result = await this.deployService.redeploy(app.id);

    return {
      success: true,
      message: `Deploy iniciado para ${appName}`,
      version: result.version,
    };
  }

  async generateGitHubActionsWorkflow(appId: string, sshHost: string, sshUser: string): Promise<string> {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App não encontrado');

    return `
name: Deploy ${app.name}

on:
  push:
    branches:
      - ${app.branch}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: \${{ secrets.SSH_HOST }}
          username: \${{ secrets.SSH_USER }}
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            curl -X POST http://localhost:10001/api/deploy/${app.id} \\
              -H "Authorization: Bearer \${{ secrets.DEPLOYHUB_TOKEN }}" \\
              -H "Content-Type: application/json"

      - name: Notify Success
        if: success()
        run: echo "✅ Deploy successful for ${app.name}"

      - name: Notify Failure  
        if: failure()
        run: echo "❌ Deploy failed for ${app.name}"
`;
  }

  async regenerateWebhookSecret(appId: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App não encontrado');

    const newSecret = crypto.randomBytes(32).toString('hex');

    await this.prisma.app.update({
      where: { id: appId },
      data: { webhookSecret: newSecret },
    });

    return { secret: newSecret };
  }
}
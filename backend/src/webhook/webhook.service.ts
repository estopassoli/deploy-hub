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

  async handleGitHubWebhook(appName: string, signature: string, event: string, payload: any, rawBody?: Buffer) {
    console.log(`[Webhook] Received webhook for app: ${appName}`);
    console.log(`[Webhook] Event: ${event}`);
    console.log(`[Webhook] Signature received: ${signature}`);
    
    const app = await this.prisma.app.findUnique({ where: { name: appName } });

    if (!app) {
      console.log(`[Webhook] App not found: ${appName}`);
      throw new BadRequestException('App não encontrado');
    }

    console.log(`[Webhook] App found: ${app.name}, branch: ${app.branch}`);

    // Verify signature using raw body for accurate HMAC calculation
    if (app.webhookSecret) {
      const bodyToHash = rawBody ? rawBody.toString('utf8') : JSON.stringify(payload);
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', app.webhookSecret)
        .update(bodyToHash)
        .digest('hex');

      console.log(`[Webhook] Body to hash: ${bodyToHash}`);
      console.log(`[Webhook] Expected signature: ${expectedSignature}`);

      if (signature !== expectedSignature) {
        console.log(`[Webhook] Signature mismatch!`);
        throw new UnauthorizedException('Assinatura inválida');
      }
      console.log(`[Webhook] Signature verified!`);
    } else {
      console.log(`[Webhook] No webhook secret configured, skipping signature verification`);
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

  async generateGitHubActionsWorkflow(appId: string, sshHost: string, sshUser: string): Promise<{ workflow: string }> {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App não encontrado');

    const apiUrl = (process.env.API_URL || 'http://localhost:10001').replace(/\/$/, '');

    // Build the JSON payload as a proper string for accurate HMAC
    const workflow = `name: Deploy ${app.name}

on:
  push:
    branches:
      - ${app.branch}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Deploy
        env:
          WEBHOOK_SECRET: \${{ secrets.DEPLOY_WEBHOOK_SECRET }}
        run: |
          PAYLOAD='{"ref":"refs/heads/${app.branch}","head_commit":{"message":"$\{GITHUB_SHA:0:7} - Auto deploy"}}'
          SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')"
          
          curl -X POST "${apiUrl}/api/webhook/github/${app.name}" \\
            -H "Content-Type: application/json" \\
            -H "X-Hub-Signature-256: $SIGNATURE" \\
            -H "X-GitHub-Event: push" \\
            -d "$PAYLOAD"

      - name: Notify Success
        if: success()
        run: echo "✅ Deploy successful for ${app.name}"

      - name: Notify Failure  
        if: failure()
        run: echo "❌ Deploy failed for ${app.name}"
`;

    return { workflow };
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

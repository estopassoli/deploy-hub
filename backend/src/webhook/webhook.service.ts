import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DeployService } from '../deploy/deploy.service';
import { PrismaService } from '../prisma/prisma.service';
import { PreviewService } from '../preview/preview.service';
import { parseBranchEvent } from '../preview/branch-event';
import {
  decideWebhookAuth,
  describeSignatureHeader,
  parseAllowUnsigned,
  verifySignature,
} from './webhook-signature';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger('Webhook');

  constructor(
    private prisma: PrismaService,
    private deployService: DeployService,
    private previewService: PreviewService,
  ) { }

  /**
   * Recebe um webhook do GitHub.
   *
   * Nada do que entra aqui é logado com valor: nem o corpo, nem a assinatura recebida,
   * nem a esperada. Ver `webhook-signature.ts` para o porquê — a versão anterior
   * imprimia o HMAC correto a cada requisição, o que é material de replay para quem lê
   * os logs do painel.
   */
  async handleGitHubWebhook(appName: string, signature: string, event: string, payload: any, rawBody?: Buffer) {
    this.logger.log(
      `Recebido para ${appName}: evento=${event} assinatura=${describeSignatureHeader(signature)}`,
    );

    const app = await this.prisma.app.findUnique({ where: { name: appName } });

    if (!app) {
      this.logger.warn(`App não encontrado: ${appName}`);
      throw new BadRequestException('App não encontrado');
    }

    const decisao = decideWebhookAuth({
      hasSecret: Boolean(app.webhookSecret),
      allowUnsigned: parseAllowUnsigned(process.env.WEBHOOK_ALLOW_UNSIGNED),
      appName: app.name,
    });

    if (decisao.action === 'reject') {
      this.logger.error(decisao.reason);
      await this.registrarFalhaDeAutenticacao(app.id, decisao.reason);
      throw new UnauthorizedException(decisao.reason);
    }

    if (decisao.action === 'allow-unsigned') {
      // O fallback grita a cada uso, de propósito: é para uma janela de transição, não
      // para virar configuração permanente por esquecimento.
      this.logger.warn(decisao.warning);
      await this.registrarFalhaDeAutenticacao(app.id, decisao.warning, 'warn');
    } else {
      // O corpo cru é o que o GitHub assinou; reserializar o JSON muda bytes (ordem de
      // chaves, espaços) e invalidaria assinaturas legítimas.
      const corpo = rawBody ?? Buffer.from(JSON.stringify(payload), 'utf8');

      if (!verifySignature(app.webhookSecret!, signature, corpo)) {
        this.logger.warn(`Assinatura inválida para ${appName}`);
        await this.registrarFalhaDeAutenticacao(app.id, `Webhook rejeitado: assinatura inválida`);
        throw new UnauthorizedException('Assinatura inválida');
      }
    }

    const branchEvent = parseBranchEvent(event, payload);

    if (branchEvent.kind === 'ignore') {
      return { message: branchEvent.reason || `Evento ${event} ignorado` };
    }

    const branch = branchEvent.branch;

    // Branch configurada do app: o caminho de sempre, deploy normal. Nada aqui muda
    // para quem já usa o webhook.
    if (branchEvent.kind === 'push' && branch === app.branch) {
      return this.deployConfiguredBranch(app, appName, payload);
    }

    // Qualquer outra branch é território de preview. Um preview não gera preview de si
    // mesmo — senão um push numa branch de preview criaria um neto.
    if (app.isPreview) {
      return { message: `Push para branch ${branch} ignorado (${appName} é um preview)` };
    }

    const resultado = await this.previewService.handleBranchEvent(
      { id: app.id, name: app.name, domain: app.domain },
      branch,
      branchEvent.kind,
    );

    return { success: resultado.handled, message: resultado.message, preview: resultado.previewName };
  }

  /**
   * Deixa a recusa visível no painel, não só no stdout do PM2.
   *
   * Um webhook rejeitado é silencioso do lado de quem operava o painel: o deploy
   * simplesmente para de acontecer. Sem este registro, a causa só aparece para quem
   * souber ler o log do processo.
   */
  private async registrarFalhaDeAutenticacao(
    appId: string,
    mensagem: string,
    level: 'warn' | 'error' = 'error',
  ): Promise<void> {
    await this.prisma.systemLog
      .create({ data: { level, message: mensagem, source: 'github', appId } })
      .catch(() => undefined);
  }

  /** Deploy da branch configurada — o comportamento que o webhook sempre teve. */
  private async deployConfiguredBranch(
    app: { id: string },
    appName: string,
    payload: any,
  ) {

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
    const result = await this.deployService.redeploy(app.id, { source: 'webhook' });

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

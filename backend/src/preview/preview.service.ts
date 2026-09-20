import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppsService } from '../apps/apps.service';
import { DeployService } from '../deploy/deploy.service';
import { SettingsService } from '../system/settings.service';
import { isSafeDomain } from '../common/validation';
import {
  allocatePort,
  branchMatchesPattern,
  branchToSlug,
  expiredPreviews,
  parsePortRange,
  previewAppName,
  previewDomain,
} from './preview-naming';

/**
 * Previews efêmeros por branch.
 *
 * Um push numa branch que casa com o padrão configurado cria (ou atualiza) um app
 * completo em `<branch>.<domínio do pai>`; apagar a branch destrói tudo.
 *
 * ## Três decisões que evitam estragar a produção
 *
 * 1. **Porta vem de uma faixa reservada.** A alocação nunca sai de
 *    `PREVIEW_PORT_RANGE`; se a faixa lotar, o preview falha em vez de procurar porta
 *    em outro lugar e colidir com um app de produção.
 * 2. **Padrão de branch vazio significa nenhuma branch.** Preview não pode começar a
 *    acontecer sozinho depois de um update só porque alguém fez push.
 * 3. **O certificado passa pela cota do Let's Encrypt** (ver
 *    `certificate-quota.service.ts`). Cota esgotada não derruba o preview: ele sobe em
 *    HTTP e o log avisa. O que não pode acontecer é o mecanismo de preview gastar as
 *    emissões de que a produção precisa sem ninguém ver.
 *
 * ## O que o painel não controla
 *
 * O DNS. `*.meu-app.exemplo.com` precisa apontar para o servidor, e criar esse registro
 * está fora do alcance do DeployHub. Sem ele, o preview sobe e fica inacessível — por
 * isso `validateParent` avisa antes de qualquer coisa.
 */
@Injectable()
export class PreviewService {
  private readonly logger = new Logger('PreviewService');

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    @Inject(forwardRef(() => AppsService)) private apps: AppsService,
    @Inject(forwardRef(() => DeployService)) private deploys: DeployService,
  ) {}

  private get portRange() {
    return parsePortRange(process.env.PREVIEW_PORT_RANGE);
  }

  /**
   * Trata um evento de branch vindo do webhook.
   *
   * Devolve uma descrição do que foi feito — é o corpo da resposta ao GitHub, e o que
   * aparece no log do webhook.
   */
  async handleBranchEvent(
    parentApp: { id: string; name: string; domain: string | null },
    branch: string,
    event: 'push' | 'delete',
  ): Promise<{ handled: boolean; message: string; previewName?: string }> {
    const config = await this.settings.getPreview();

    if (!config.previewEnabled) {
      return { handled: false, message: 'Preview por branch está desligado nas configurações' };
    }

    if (!branchMatchesPattern(branch, config.previewBranchPattern)) {
      return { handled: false, message: `Branch ${branch} não casa com o padrão de preview` };
    }

    const slug = branchToSlug(branch);
    if (!slug) {
      return { handled: false, message: `Branch ${branch} não gera um subdomínio válido` };
    }

    const nome = previewAppName(parentApp.name, slug);
    if (!nome) {
      return { handled: false, message: `Não foi possível gerar um nome de app para ${branch}` };
    }

    if (event === 'delete') {
      return this.destroy(nome);
    }

    return this.createOrUpdate(parentApp, branch, slug, nome, config.previewTtlDays);
  }

  /** Confere o que o painel precisa para que o preview seja acessível. */
  validateParent(parentApp: { domain: string | null }): { ok: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (!parentApp.domain) {
      return {
        ok: false,
        warnings: ['O app não tem domínio configurado — sem ele não há como montar o subdomínio do preview.'],
      };
    }

    warnings.push(
      `Requer DNS curinga *.${parentApp.domain} apontando para este servidor. ` +
        'O DeployHub não cria esse registro — sem ele o preview sobe mas fica inacessível.',
    );

    return { ok: true, warnings };
  }

  private async createOrUpdate(
    parentApp: { id: string; name: string; domain: string | null },
    branch: string,
    slug: string,
    nome: string,
    ttlDays: number,
  ): Promise<{ handled: boolean; message: string; previewName?: string }> {
    const existente = await this.prisma.app.findUnique({ where: { name: nome } });

    if (existente) {
      // Push numa branch que já tem preview: só redeploya, mantendo porta e domínio.
      this.deploys
        .redeploy(existente.id, { source: 'webhook' })
        .catch((error) => this.logger.warn(`Redeploy do preview ${nome} falhou: ${error.message}`));

      return { handled: true, message: `Preview ${nome} atualizado`, previewName: nome };
    }

    const pai = await this.prisma.app.findUnique({ where: { id: parentApp.id } });
    if (!pai) throw new NotFoundException('App pai não encontrado');

    const dominio = previewDomain(pai.domain, slug);
    if (!dominio || !isSafeDomain(dominio)) {
      return { handled: false, message: `Domínio de preview inválido para a branch ${branch}` };
    }

    const porta = await this.allocatePreviewPort();
    if (porta === null) {
      const { start, end } = this.portRange;
      return {
        handled: false,
        message:
          `Faixa de portas de preview (${start}-${end}) está cheia. ` +
          'Remova previews antigos ou amplie PREVIEW_PORT_RANGE.',
      };
    }

    // Herda tudo do pai: sem isso cada preview precisaria de env configurado à mão,
    // o que anula o propósito.
    const preview = await this.prisma.app.create({
      data: {
        name: nome,
        type: pai.type,
        port: porta,
        domain: dominio,
        repository: pai.repository,
        branch,
        appDir: pai.appDir,
        workspacePackage: pai.workspacePackage,
        envVars: pai.envVars,
        installCommand: pai.installCommand,
        buildCommand: pai.buildCommand,
        migrateCommand: pai.migrateCommand,
        startCommand: pai.startCommand,
        runtime: pai.runtime,
        containerPort: pai.containerPort,
        dockerContext: pai.dockerContext,
        healthPath: pai.healthPath,
        // Limites herdados: um preview não deve poder consumir mais recursos que o
        // app de produção de que veio.
        maxMemoryMb: pai.maxMemoryMb,
        cpuLimit: pai.cpuLimit,
        isPreview: true,
        previewOfAppId: pai.id,
        previewBranch: branch,
        // Monitoramento externo fica desligado: um preview que cai não é incidente.
        uptimeEnabled: false,
        webhookSecret: crypto.randomBytes(16).toString('hex'),
      },
    });

    this.logger.log(`Preview ${nome} criado para a branch ${branch} em ${dominio} (porta ${porta})`);

    await this.prisma.systemLog.create({
      data: {
        level: 'info',
        message: `Preview criado: ${nome} (${branch}) em ${dominio}`,
        source: 'preview',
        appId: preview.id,
      },
    });

    this.deploys
      .redeploy(preview.id, { source: 'webhook' })
      .catch((error) => this.logger.warn(`Deploy do preview ${nome} falhou: ${error.message}`));

    const ttl = ttlDays > 0 ? ` Será removido após ${ttlDays} dias sem push.` : '';
    return { handled: true, message: `Preview ${nome} criado em ${dominio}.${ttl}`, previewName: nome };
  }

  /** Destrói um preview. Reusa o delete normal, que já limpa processo, vhost e arquivos. */
  async destroy(name: string): Promise<{ handled: boolean; message: string; previewName?: string }> {
    const preview = await this.prisma.app.findUnique({ where: { name } });

    if (!preview) {
      return { handled: false, message: `Preview ${name} não existe` };
    }

    if (!preview.isPreview) {
      // Proteção contra um nome coincidente derrubar um app de produção.
      throw new BadRequestException(`${name} não é um preview — recusando remover`);
    }

    await this.apps.delete(preview.id);
    this.logger.log(`Preview ${name} removido`);

    await this.prisma.systemLog.create({
      data: { level: 'info', message: `Preview removido: ${name}`, source: 'preview' },
    });

    return { handled: true, message: `Preview ${name} removido`, previewName: name };
  }

  async list() {
    const previews = await this.prisma.app.findMany({
      where: { isPreview: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        domain: true,
        port: true,
        status: true,
        previewBranch: true,
        previewOfAppId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const paiIds = [...new Set(previews.map((p) => p.previewOfAppId).filter(Boolean))] as string[];
    const pais = await this.prisma.app.findMany({
      where: { id: { in: paiIds } },
      select: { id: true, name: true },
    });
    const nomePorId = new Map(pais.map((pai) => [pai.id, pai.name]));

    const { previewTtlDays } = await this.settings.getPreview();

    return previews.map((preview) => ({
      ...preview,
      parentName: preview.previewOfAppId ? (nomePorId.get(preview.previewOfAppId) ?? null) : null,
      expiresAt:
        previewTtlDays > 0
          ? new Date(preview.updatedAt.getTime() + previewTtlDays * 86_400_000)
          : null,
    }));
  }

  /**
   * Remove previews parados.
   *
   * O gatilho de `delete` de branch depende de o GitHub mandar o evento e de a branch
   * ser efetivamente apagada — nenhum dos dois é garantido. Sem TTL, um preview fica
   * para sempre ocupando porta, disco e uma entrada no PM2.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupExpired(): Promise<number> {
    const { previewEnabled, previewTtlDays } = await this.settings.getPreview();
    if (!previewEnabled || previewTtlDays <= 0) return 0;

    const previews = await this.prisma.app.findMany({
      where: { isPreview: true },
      select: { name: true, updatedAt: true },
    });

    const vencidos = expiredPreviews(previews, previewTtlDays);

    let removidos = 0;
    for (const preview of vencidos) {
      try {
        await this.destroy(preview.name);
        removidos++;
      } catch (error: any) {
        this.logger.warn(`Não foi possível remover o preview ${preview.name}: ${error.message}`);
      }
    }

    if (removidos > 0) {
      this.logger.log(`${removidos} preview(s) sem push há mais de ${previewTtlDays} dias removidos`);
    }
    return removidos;
  }

  /** Primeira porta livre da faixa reservada. */
  private async allocatePreviewPort(): Promise<number | null> {
    const usadas = await this.prisma.app.findMany({ select: { port: true } });
    return allocatePort(this.portRange, usadas.map((app) => app.port));
  }
}

import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { presetOptions } from '../deploy/app-presets';
import { DeployService } from '../deploy/deploy.service';
import { AppsService } from './apps.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// Os DTOs vivem em apps.dto.ts porque precisam ser importáveis pelos testes; veja o
// cabeçalho daquele arquivo para o motivo (decorator não passa no type-stripping).
import { CreateAppDto, UpdateAppDto } from './apps.dto';

@Controller('apps')
@UseGuards(JwtAuthGuard)
export class AppsController {
  constructor(
    private appsService: AppsService,
    @Inject(forwardRef(() => DeployService)) private deployService: DeployService,
  ) {}

  @Get()
  async findAll() {
    return this.appsService.findAll();
  }

  /**
   * Presets de aplicação disponíveis, para o select do painel.
   *
   * Declarado ANTES de `@Get(':id')`: o Nest resolve rotas na ordem de declaração, e
   * `:id` capturaria "presets" se viesse primeiro.
   */
  @Get('presets')
  async presets() {
    return presetOptions();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.appsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateAppDto) {
    return this.appsService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAppDto) {
    return this.appsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.appsService.delete(id);
  }

  @Post(':id/start')
  async start(@Param('id') id: string) {
    return this.appsService.start(id);
  }

  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    return this.appsService.stop(id);
  }

  @Post(':id/restart')
  async restart(@Param('id') id: string) {
    return this.appsService.restart(id);
  }

  @Get(':id/versions')
  async getVersions(@Param('id') id: string) {
    return this.appsService.getVersions(id);
  }

  /** Remove uma release do disco e do histórico. Recusa a que está no ar. */
  @Delete(':id/versions/:deployId')
  async deleteVersion(@Param('id') id: string, @Param('deployId') deployId: string) {
    return this.appsService.deleteVersion(id, deployId);
  }

  /** Limpeza em lote: mantém a atual e as `keep` mais recentes. */
  @Post(':id/versions/prune')
  async pruneVersions(@Param('id') id: string, @Body() body: { keep?: number }) {
    return this.appsService.pruneVersions(id, body?.keep ?? 0);
  }

  @Post(':id/rollback/:deployId')
  async rollback(@Param('id') id: string, @Param('deployId') deployId: string) {
    return this.appsService.rollback(id, deployId);
  }

  /**
   * Reescreve o `.env` da release atual e reinicia, sem clonar nem buildar.
   *
   * Trocar uma senha de banco leva segundos em vez dos minutos de um deploy inteiro.
   * A resposta traz `diff.buildRequired` com as chaves `NEXT_PUBLIC_` e `VITE_` que só
   * valem após um redeploy, para a UI poder oferecê-lo.
   */
  @Post(':id/apply-env')
  async applyEnv(@Param('id') id: string) {
    return this.deployService.applyEnv(id);
  }
}

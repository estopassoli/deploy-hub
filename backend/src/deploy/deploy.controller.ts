import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsIn, IsBoolean, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DeployService } from './deploy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BRANCH_PATTERN, NAME_MAX_LENGTH, NAME_PATTERN } from '../common/validation';
import { APP_PRESET_IDS } from './app-presets';
import { IsSafeDomain, IsSafeRepositoryUrl } from '../common/validation-decorators';

class DeployDto {
  // Vai direto para `git clone`. Além do execFile sem shell, o formato é restrito
  // porque um valor começando com '-' seria lido pelo próprio git como flag —
  // `--upload-pack=<cmd>` executa um comando arbitrário.
  @IsSafeRepositoryUrl()
  repository: string;

  // O nome vira diretório em APPS_DIR, processo PM2, container e vhost do nginx.
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NAME_PATTERN, {
    message: 'name deve conter apenas letras minúsculas, números e hífens, começando por letra ou número',
  })
  name: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  port: number;

  @IsOptional()
  @IsSafeDomain()
  domain?: string;

  // Lista vinda do registro de presets: adicionar um framework não exige tocar aqui.
  @IsString()
  @IsIn(APP_PRESET_IDS, { message: `type deve ser um destes: ${APP_PRESET_IDS.join(', ')}` })
  type: string;

  @IsOptional()
  @IsString()
  @Matches(BRANCH_PATTERN, { message: 'branch contém caracteres inválidos' })
  branch?: string;

  @IsOptional()
  @IsString()
  installCommand?: string;

  @IsOptional()
  @IsString()
  buildCommand?: string;

  @IsOptional()
  @IsString()
  migrateCommand?: string;

  @IsOptional()
  @IsString()
  startCommand?: string;

  @IsOptional()
  @IsString()
  appDir?: string;

  @IsOptional()
  @IsString()
  workspacePackage?: string;

  @IsOptional()
  @IsString()
  envVars?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  generateSSL?: boolean;
}

@Controller('deploy')
export class DeployController {
  constructor(private deployService: DeployService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async deploy(@Body() dto: DeployDto) {
    return this.deployService.deploy({ ...dto, source: 'ui' });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':appId')
  async redeploy(@Param('appId') appId: string) {
    return this.deployService.redeploy(appId, { source: 'ui' });
  }

  @UseGuards(JwtAuthGuard)
  /**
   * Sugere N portas livres de uma vez, para o fluxo de monorepo.
   *
   * `exclude` recebe o que o formulário já escolheu, separado por vírgula, para o
   * lote não repetir o que está na tela.
   */
  @Get('free-ports')
  async freePorts(@Query('count') count?: string, @Query('exclude') exclude?: string) {
    const quantos = Math.min(Math.max(parseInt(count ?? '1', 10) || 1, 1), 50);
    const evitar = (exclude ?? '')
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => Number.isInteger(p));

    return this.deployService.suggestPorts(quantos, evitar);
  }

  @Get('check-port/:port')
  async checkPort(@Param('port') port: string) {
    return this.deployService.checkPort(parseInt(port));
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory() {
    return this.deployService.getDeployHistory();
  }

  /** Deploys em andamento agora — alimenta o botão de cancelar no painel. */
  @UseGuards(JwtAuthGuard)
  @Get('running')
  async getRunning() {
    return this.deployService.runningDeploys();
  }

  /**
   * Cancela o deploy em andamento.
   *
   * `key` é o nome do app ou do projeto — a mesma chave usada no stream de logs por
   * WebSocket, que é o que a UI já tem em mãos na tela de deploy.
   */
  @UseGuards(JwtAuthGuard)
  @Post('cancel/:key')
  async cancelDeploy(@Param('key') key: string) {
    return this.deployService.cancel(key);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':deployId/logs')
  async getDeployLogs(@Param('deployId') deployId: string) {
    return this.deployService.getDeployLogs(deployId);
  }
}

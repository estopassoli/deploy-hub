import { Controller, Post, Body, Param, UseGuards, Get } from '@nestjs/common';
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

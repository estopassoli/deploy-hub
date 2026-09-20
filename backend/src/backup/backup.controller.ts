import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from '../system/settings.service';
import { BackupService } from './backup.service';

@Controller('backups')
@UseGuards(JwtAuthGuard)
export class BackupController {
  constructor(
    private backups: BackupService,
    private settings: SettingsService,
  ) {}

  @Get()
  async list() {
    const [files, config] = await Promise.all([this.backups.list(), this.settings.getBackup()]);
    return { files, config, directory: this.backups.backupDir };
  }

  @Get('settings')
  async getSettings() {
    return this.settings.getBackup();
  }

  @Put('settings')
  async updateSettings(
    @Body() dto: { backupEnabled?: boolean; backupRetentionDays?: number; backupApps?: boolean },
  ) {
    try {
      return await this.settings.updateBackup(dto);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  /** Roda o backup agora, sem esperar o cron das 2h. */
  @Post('run')
  async runNow() {
    const results = await this.backups.runAll();
    return { results };
  }

  /**
   * Baixa um backup.
   *
   * O nome vem da URL, então passa pelo `resolveBackupPath`, que recusa qualquer
   * caminho fora do diretório de backups — sem isso, um `../../etc/shadow` sairia por
   * aqui.
   */
  @Get('download/:name')
  async download(@Param('name') name: string, @Res() res: Response) {
    let caminho: string;
    try {
      caminho = await this.backups.resolveBackupPath(name);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    res.download(caminho, name);
  }

  @Delete(':name')
  async remove(@Param('name') name: string) {
    try {
      await this.backups.remove(name);
      return { success: true };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}

import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AppsService } from './apps.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// Os DTOs vivem em apps.dto.ts porque precisam ser importáveis pelos testes; veja o
// cabeçalho daquele arquivo para o motivo (decorator não passa no type-stripping).
import { CreateAppDto, UpdateAppDto } from './apps.dto';

@Controller('apps')
@UseGuards(JwtAuthGuard)
export class AppsController {
  constructor(private appsService: AppsService) {}

  @Get()
  async findAll() {
    return this.appsService.findAll();
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

  @Post(':id/rollback/:deployId')
  async rollback(@Param('id') id: string, @Param('deployId') deployId: string) {
    return this.appsService.rollback(id, deployId);
  }
}

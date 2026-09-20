import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { APP_PRESET_IDS } from '../deploy/app-presets';
import { BRANCH_PATTERN, NAME_MAX_LENGTH, NAME_PATTERN } from '../common/validation';
import { IsSafeDomain, IsSafeRepositoryUrl } from '../common/validation-decorators';
import { ProjectsService } from './projects.service';

class DetectDto {
  @IsSafeRepositoryUrl() repository: string;
  @IsOptional() @IsString() @Matches(BRANCH_PATTERN, { message: 'branch contém caracteres inválidos' }) branch?: string;
}

class ServiceDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'name deve conter apenas letras minúsculas, números e hífens, começando por letra ou número' })
  name: string;
  @IsString() appDir: string;
  @IsOptional() @IsString() workspacePackage?: string;
  @IsString() @IsIn(APP_PRESET_IDS, { message: `type deve ser um destes: ${APP_PRESET_IDS.join(', ')}` }) type: string;
  @IsNumber() @Transform(({ value }) => parseInt(value, 10)) port: number;
  @IsOptional() @IsSafeDomain() domain?: string;
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsString() migrateCommand?: string;
  @IsOptional() @IsString() startCommand?: string;
}

class CreateProjectDto {
  // Mesmo raciocínio do nome de service: vira diretório, vhost e nome de processo.
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NAME_PATTERN, {
    message: 'name deve conter apenas letras minúsculas, números e hífens, começando por letra ou número',
  })
  name: string;
  @IsSafeRepositoryUrl() repository: string;
  @IsOptional() @IsString() @Matches(BRANCH_PATTERN, { message: 'branch contém caracteres inválidos' }) branch?: string;
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') generateSSL?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ServiceDto) services: ServiceDto[];
}

class UpdateProjectDto {
  @IsOptional() @IsString() envVars?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[\w.\-\/]+$/, { message: 'branch contém caracteres inválidos' })
  branch?: string;
}

class AddServiceDto extends ServiceDto {
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') generateSSL?: boolean;
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Post('detect')
  detect(@Body() dto: DetectDto) {
    return this.projects.detect(dto.repository, dto.branch);
  }

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Get(':id/available-services')
  availableServices(@Param('id') id: string, @Query('source') source?: string) {
    return this.projects.availableServices(id, source === 'repo' ? 'repo' : 'release');
  }

  @Post(':id/services')
  addService(@Param('id') id: string, @Body() dto: AddServiceDto) {
    return this.projects.addService(id, dto);
  }

  @Post(':id/services/:appId/deploy')
  redeployService(@Param('id') id: string, @Param('appId') appId: string) {
    return this.projects.redeployService(id, appId);
  }

  @Delete(':id/services/:appId')
  removeService(@Param('id') id: string, @Param('appId') appId: string) {
    return this.projects.removeService(id, appId);
  }

  @Post(':id/redeploy')
  redeploy(@Param('id') id: string) {
    return this.projects.redeploy(id);
  }

  @Post(':id/rollback/:deployId')
  rollback(@Param('id') id: string, @Param('deployId') deployId: string) {
    return this.projects.rollback(id, deployId);
  }

  @Post(':id/generate-ssl')
  generateSsl(@Param('id') id: string) {
    return this.projects.generateSsl(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }
}

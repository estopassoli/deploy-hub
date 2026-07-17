import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';

class DetectDto {
  @IsString() repository: string;
  @IsOptional() @IsString() branch?: string;
}

class ServiceDto {
  @IsString() name: string;
  @IsString() appDir: string;
  @IsOptional() @IsString() workspacePackage?: string;
  @IsString() @IsIn(['nestjs', 'nextjs', 'vitejs']) type: string;
  @IsNumber() @Transform(({ value }) => parseInt(value, 10)) port: number;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsString() migrateCommand?: string;
  @IsOptional() @IsString() startCommand?: string;
}

class CreateProjectDto {
  @IsString() name: string;
  @IsString() repository: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') generateSSL?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ServiceDto) services: ServiceDto[];
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

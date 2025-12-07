import { Controller, Post, Body, Param, UseGuards, Get } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { DeployService } from './deploy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class DeployDto {
  @IsString()
  repository: string;

  @IsString()
  name: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  port: number;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsString()
  @IsIn(['nestjs', 'nextjs', 'vitejs'])
  type: 'nestjs' | 'nextjs' | 'vitejs';

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  installCommand?: string;

  @IsOptional()
  @IsString()
  envVars?: string;
}

@Controller('deploy')
export class DeployController {
  constructor(private deployService: DeployService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async deploy(@Body() dto: DeployDto) {
    return this.deployService.deploy(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':appId')
  async redeploy(@Param('appId') appId: string) {
    return this.deployService.redeploy(appId);
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
}

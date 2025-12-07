import { Controller, Post, Body, Param, UseGuards, Get } from '@nestjs/common';
import { DeployService } from './deploy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class DeployDto {
  repository: string;
  name: string;
  port: number;
  domain?: string;
  type: 'nestjs' | 'nextjs' | 'vitejs';
  branch?: string;
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

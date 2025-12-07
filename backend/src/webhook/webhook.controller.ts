import { Controller, Post, Get, Body, Headers, Param, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('webhook')
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  @Post('github/:appName')
  async handleGitHubWebhook(
    @Param('appName') appName: string,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody;
    return this.webhookService.handleGitHubWebhook(appName, signature, event, body, rawBody);
  }

  @UseGuards(JwtAuthGuard)
  @Get('github/workflow/:appId')
  async getGitHubWorkflow(@Param('appId') appId: string) {
    const sshHost = process.env.SSH_HOST || '62.72.9.22';
    const sshUser = process.env.SSH_USER || 'root';
    return this.webhookService.generateGitHubActionsWorkflow(appId, sshHost, sshUser);
  }

  @UseGuards(JwtAuthGuard)
  @Post('regenerate-secret/:appId')
  async regenerateWebhookSecret(@Param('appId') appId: string) {
    return this.webhookService.regenerateWebhookSecret(appId);
  }
}

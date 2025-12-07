import { Controller, Post, Body, Headers, Param, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

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
    return this.webhookService.handleGitHubWebhook(appName, signature, event, body);
  }
}

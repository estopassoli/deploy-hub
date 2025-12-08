import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private resendApiKey: string | undefined;

  constructor(private prisma: PrismaService) {
    this.resendApiKey = process.env.RESEND_API_KEY;
  }

  private async getEmailSettings() {
    const settings = await this.prisma.systemSettings.findFirst();
    return {
      emailEnabled: settings?.emailEnabled ?? false,
      emailRecipient: settings?.emailRecipient ?? null,
    };
  }

  async sendEmail(payload: EmailPayload): Promise<boolean> {
    if (!this.resendApiKey) {
      console.log('[EmailService] RESEND_API_KEY not configured');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'DeployHub <noreply@resend.dev>',
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[EmailService] Failed to send email:', error);
        return false;
      }

      console.log('[EmailService] Email sent successfully to:', payload.to);
      return true;
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return false;
    }
  }

  async notifyDeployFailed(appName: string, error?: string): Promise<void> {
    const { emailEnabled, emailRecipient } = await this.getEmailSettings();

    if (!emailEnabled || !emailRecipient) {
      console.log('[EmailService] Email notifications disabled or no recipient configured');
      return;
    }

    const subject = `🚨 Deploy Failed: ${appName}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 30px; color: white;">
          <h1 style="margin: 0 0 20px 0; font-size: 24px; display: flex; align-items: center; gap: 10px;">
            🚨 Deploy Failed
          </h1>
          <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Application: ${appName}</p>
            ${error ? `<p style="margin: 0; color: #fca5a5; font-family: monospace; font-size: 14px;">${error}</p>` : ''}
          </div>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">
            Check the deployment logs for more details.
          </p>
        </div>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
          DeployHub Notification System
        </p>
      </div>
    `;

    await this.sendEmail({ to: emailRecipient, subject, html });
  }

  async notifyDeploySuccess(appName: string, version?: string): Promise<void> {
    const { emailEnabled, emailRecipient } = await this.getEmailSettings();

    if (!emailEnabled || !emailRecipient) {
      return;
    }

    const subject = `✅ Deploy Successful: ${appName}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 30px; color: white;">
          <h1 style="margin: 0 0 20px 0; font-size: 24px; display: flex; align-items: center; gap: 10px;">
            ✅ Deploy Successful
          </h1>
          <div style="background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.5); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Application: ${appName}</p>
            ${version ? `<p style="margin: 0; color: #86efac; font-family: monospace; font-size: 14px;">Version: ${version}</p>` : ''}
          </div>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">
            Your application is now live!
          </p>
        </div>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
          DeployHub Notification System
        </p>
      </div>
    `;

    await this.sendEmail({ to: emailRecipient, subject, html });
  }

  async notifyAppStopped(appName: string, reason?: string): Promise<void> {
    const { emailEnabled, emailRecipient } = await this.getEmailSettings();

    if (!emailEnabled || !emailRecipient) {
      return;
    }

    const subject = `⚠️ Application Stopped: ${appName}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 30px; color: white;">
          <h1 style="margin: 0 0 20px 0; font-size: 24px; display: flex; align-items: center; gap: 10px;">
            ⚠️ Application Stopped
          </h1>
          <div style="background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.5); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Application: ${appName}</p>
            ${reason ? `<p style="margin: 0; color: #fde68a; font-family: monospace; font-size: 14px;">${reason}</p>` : ''}
          </div>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">
            The application may have crashed unexpectedly. Check the logs for more information.
          </p>
        </div>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
          DeployHub Notification System
        </p>
      </div>
    `;

    await this.sendEmail({ to: emailRecipient, subject, html });
  }
}

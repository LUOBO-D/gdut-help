import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transporter =
      env.MAIL_DRIVER === 'smtp'
        ? nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            connectionTimeout: 8_000,
            greetingTimeout: 8_000,
            socketTimeout: 12_000,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
          })
        : null;
  }

  async sendLoginCode(to: string, code: string, ttlMinutes: number): Promise<void> {
    const subject = `GDUT Help 登录验证码：${code}`;
    const text = `你的登录验证码是 ${code}，${ttlMinutes} 分钟内有效。\n如果不是你本人操作，请忽略这封邮件。`;
    await this.send(to, subject, text);
  }

  /** 提醒邮件：标题直接写待办内容，手机邮箱 App 的通知里就能看到 */
  async sendReminder(to: string, title: string, body: string, link: string | null): Promise<void> {
    const url = link ? `${this.env.APP_URL.replace(/\/$/, '')}${link}` : this.env.APP_URL;
    await this.send(to, `⏰ ${title}`, `${body}\n\n打开 GDUT Help：${url}\n\n（在「我的 → 提醒设置」里可以关闭邮件提醒）`);
  }

  /** 高危安全事件实时告警邮件（蜜罐诱捕、网段联封、反复恶意隔离等） */
  async sendSecurityAlert(to: string, subject: string, body: string): Promise<void> {
    await this.send(to, subject, body);
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      // 仅开发环境：不真实发信，把内容打印到日志（env 校验保证生产环境不会走到这里）
      this.logger.warn(`[console 邮件] 收件人 ${to}｜${subject}`);
      return;
    }
    await this.transporter.sendMail({ from: this.env.MAIL_FROM, to, subject, text });
  }
}

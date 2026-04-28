import nodemailer from 'nodemailer';

function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

class EmailService {
    constructor() {
        this.transporter = createTransporter();
    }

    async sendVerificationCode(to, code) {
        const from = process.env.SMTP_USER;
        const codeStr = String(code);

        if (!from || !process.env.SMTP_PASS) {
            console.error('[email] SMTP_USER или SMTP_PASS не заданы в окружении');
            return;
        }

        const subject = 'Код подтверждения email';
        const text = `Здравствуйте!\n\nВаш код подтверждения: ${codeStr}\n\nВведите его в приложении, чтобы завершить регистрацию.\n\nЕсли вы не создавали аккаунт, проигнорируйте это письмо.\n`;

        const html = `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:12px;box-shadow:0 4px 24px rgba(15,23,42,0.08);overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#0f172a;">Подтверждение почты</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;">
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">
                Используйте код ниже, чтобы подтвердить адрес электронной почты:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 20px auto;">
                <tr>
                  <td style="border-radius:10px;background:#f1f5f9;border:2px dashed #94a3b8;padding:18px 32px;text-align:center;">
                    <span style="font-size:28px;font-weight:700;letter-spacing:0.35em;color:#0f172a;font-family:ui-monospace,monospace;">${codeStr}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">
                Ваш код подтверждения: <strong>${codeStr}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">Это автоматическое письмо, отвечать на него не нужно.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

        try {
            await this.transporter.sendMail({
                from,
                to,
                subject,
                text,
                html,
            });
        } catch (err) {
            console.error('[email] Не удалось отправить письмо с кодом:', err?.message || err);
        }
    }
}

export default new EmailService();

import { Injectable, Logger } from '@nestjs/common';

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  languageCode?: string;
  params?: string[];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  async sendTemplate(options: SendTemplateOptions): Promise<void> {
    const { to, templateName, languageCode = 'es', params = [] } = options;

    const apiUrl = process.env.WHATSAPP_API_URL ?? '';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    if (!apiUrl || !token || !phoneNumberId) {
      this.logger.warn('WhatsApp no configurado, omitiendo envío');
      return;
    }

    // Normalizar teléfono: quitar espacios, guiones y asegurar prefijo internacional
    const phone = to.replace(/[\s\-\(\)]/g, '');

    const body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(params.length > 0 && {
          components: [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ],
        }),
      },
    };

    const url = `${apiUrl}/${phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${error}`);
    }

    this.logger.log(`WhatsApp enviado a ${phone} con plantilla "${templateName}"`);
  }
}

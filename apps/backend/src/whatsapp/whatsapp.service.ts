import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { ContactStatus } from '../contacts/entities/contact.entity';
import {
  InteractionDirection,
  InteractionType,
} from '../interactions/entities/interaction.entity';
import { InteractionsService } from '../interactions/interactions.service';
import { SendTemplateDto } from './dto/send-template.dto';

interface WhatsAppTemplate {
  name: string;
  status: string;
  language: string;
}

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
        }>;
        contacts?: Array<{ profile?: { name?: string } }>;
      };
    }>;
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly contactsService: ContactsService,
    private readonly interactionsService: InteractionsService,
  ) {}

  async sendTemplate(options: SendTemplateDto) {
    const { to, templateName, languageCode = 'es', params = [] } = options;
    const phone = this.normalizePhone(to);
    const response = await this.sendToMeta({
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
    });
    await this.logOutboundMessage(
      phone,
      `WhatsApp enviado (plantilla: ${templateName})`,
    );
    return response;
  }

  async sendText(to: string, text: string) {
    const phone = this.normalizePhone(to);
    const response = await this.sendToMeta({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    });
    await this.logOutboundMessage(phone, text);
    return response;
  }

  async getTemplates(): Promise<WhatsAppTemplate[]> {
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
    if (!token || !businessAccountId) {
      this.logger.warn(
        'WhatsApp no configurado: no se pueden consultar plantillas',
      );
      return [];
    }

    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const response = await fetch(
      `${apiUrl}/${businessAccountId}/message_templates?limit=100&fields=name,status,language`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      throw new Error(
        `WhatsApp templates API error ${response.status}: ${await response.text()}`,
      );
    }

    const json = (await response.json()) as { data?: WhatsAppTemplate[] };
    return json.data ?? [];
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (
      mode === 'subscribe' &&
      token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return challenge;
    }
    throw new UnauthorizedException('Token de webhook inválido');
  }

  async handleWebhook(body: unknown): Promise<void> {
    const webhook = body as WhatsAppWebhookBody;
    for (const entry of webhook.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          await this.handleIncomingMessage(
            message,
            change.value?.contacts?.[0]?.profile?.name,
          );
        }
      }
    }
  }

  private async handleIncomingMessage(
    message: {
      from?: string;
      type?: string;
      text?: { body?: string };
      button?: { text?: string };
    },
    profileName?: string,
  ) {
    const phone = this.normalizePhone(message.from ?? '');
    if (!phone) return;

    let contact = await this.contactsService.findOneByPhone(phone);
    if (!contact) {
      contact = await this.contactsService.create({
        name: profileName?.trim() || `Nuevo contacto (WA ${phone.slice(-4)})`,
        phone,
        status: ContactStatus.NEW,
      });
    }

    const text =
      message.text?.body ??
      message.button?.text ??
      `[Mensaje tipo: ${message.type ?? 'desconocido'}]`;
    await this.interactionsService.createSystemInteraction({
      contactId: contact.id,
      type: InteractionType.WHATSAPP,
      direction: InteractionDirection.INBOUND,
      notes: text,
    });
  }

  private async sendToMeta(body: Record<string, unknown>) {
    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    if (!token || !phoneNumberId) {
      throw new Error(
        'WhatsApp no está configurado: faltan WHATSAPP_API_TOKEN o WHATSAPP_PHONE_NUMBER_ID',
      );
    }

    const response = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `WhatsApp API error ${response.status}: ${await response.text()}`,
      );
    }
    return response.json();
  }

  private async logOutboundMessage(phone: string, notes: string) {
    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (!contact) return;
      await this.interactionsService.createSystemInteraction({
        contactId: contact.id,
        type: InteractionType.WHATSAPP,
        direction: InteractionDirection.OUTBOUND,
        notes,
      });
    } catch (error) {
      this.logger.error(
        `WhatsApp enviado pero no se pudo guardar el historial: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, '');
  }
}

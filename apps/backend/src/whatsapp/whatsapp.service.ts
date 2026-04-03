import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { InteractionsService } from '../interactions/interactions.service';
import { InteractionDirection, InteractionType } from '../interactions/entities/interaction.entity';

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  languageCode?: string;
  params?: string[];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => InteractionsService))
    private readonly interactionsService: InteractionsService,
  ) {}

  async sendTemplate(options: SendTemplateOptions): Promise<void> {
    const { to, templateName, languageCode = 'es', params = [] } = options;

    const apiUrl = process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    if (!token || !phoneNumberId) {
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

    // Log internally as interaction
    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (contact) {
        await this.interactionsService.createSystemInteraction({
          contactId: contact.id,
          type: InteractionType.WHATSAPP,
          direction: InteractionDirection.OUTBOUND,
          notes: `WhatsApp enviado (plantilla: ${templateName})`,
        });
      }
    } catch (err) {
      this.logger.error(`Error registrando interacción de WhatsApp saliente: ${err.message}`);
    }
  }

  async getTemplates(): Promise<{ name: string; status: string; language: string }[]> {
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';

    if (!token || !businessAccountId) {
      this.logger.warn('WhatsApp no configurado');
      return [];
    }

    const url = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates?limit=100&fields=name,status,language`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`WhatsApp templates API error ${res.status}: ${error}`);
    }

    const json = (await res.json()) as { data: { name: string; status: string; language: string }[] };
    return json.data ?? [];
  }

  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
    const MY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === MY_TOKEN) {
      return challenge;
    }
    throw new Error('Forbidden');
  }

  async handleWebhook(body: any): Promise<void> {
    this.logger.log('Webhook de WhatsApp recibido');
    
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const messages = value.messages || [];
        const metadata = value.metadata;

        if (messages.length === 0) {
          this.logger.debug('Webhook recibido sin mensajes (posiblemente actualización de estado)');
          continue;
        }

        for (const msg of messages) {
          try {
            const from = msg.from; 
            const displayPhone = metadata?.display_phone_number?.replace(/\D/g, '');
            const msgFromClean = from.replace(/\D/g, '');

            // Determinar dirección: si el 'from' es nuestro número, es saliente sync (echo)
            const isOutbound = !!(displayPhone && (msgFromClean === displayPhone));
            const targetPhone = isOutbound ? (msg as any).to : from;
            const direction = isOutbound ? InteractionDirection.OUTBOUND : InteractionDirection.INBOUND;
            
            const text = msg.text?.body || msg.button?.text || `[Mensaje tipo: ${msg.type}]`;
            
            this.logger.log(`Procesando mensaje WA ${direction} - De/A: ${targetPhone}`);

            if (!targetPhone) {
              this.logger.warn('No se pudo determinar el teléfono del contacto');
              continue;
            }

            let contact = await this.contactsService.findOneByPhone(targetPhone);
            
            if (!contact && direction === InteractionDirection.INBOUND) {
              this.logger.log(`Contacto no encontrado para ${targetPhone}, creando automáticamente...`);
              contact = await this.contactsService.create({
                name: `Nuevo Contacto (WA ${targetPhone.slice(-4)})`,
                phone: targetPhone,
                source: 'whatsapp' as any,
                status: 'new' as any,
              });
            }

            if (contact) {
              this.logger.log(`Guardando interacción WA para contacto: ${contact.name} (${contact.id})`);
              await this.interactionsService.createSystemInteraction({
                contactId: contact.id,
                type: InteractionType.WHATSAPP,
                direction,
                notes: text,
              });
              this.logger.log('Interacción WA guardada correctamente');
            } else {
              this.logger.warn(`Mensaje WA de ${targetPhone} ignorado (sin contacto y no es entrante)`);
            }
          } catch (err) {
            this.logger.error(`Error procesando mensaje individual de WA: ${err.message}`, err.stack);
          }
        }
      }
    }
  }
}

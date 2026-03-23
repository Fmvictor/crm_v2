import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('webhooks')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Post('stripe')
  @HttpCode(200)
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest,
  ): Promise<{ received: boolean }> {
    if (!signature) throw new BadRequestException('Missing stripe-signature header');
    if (!req.rawBody) throw new BadRequestException('Missing raw body');

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(req.rawBody, signature);
    } catch (err) {
      this.logger.error(`Webhook signature inválida: ${err.message}`);
      throw new BadRequestException(`Webhook error: ${err.message}`);
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        await this.stripeService.handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
      }
    } catch (err) {
      this.logger.error(`Error procesando evento ${event.type}: ${err.message}`);
    }

    return { received: true };
  }
}

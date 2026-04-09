import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
  constructor(private readonly eventEmitter: any) {}

  async createUser(data: unknown) {
    this.eventEmitter.emit('user.created', data);
    this.eventEmitter.emit('user.welcome.sent', data);
  }

  @OnEvent('order.placed')
  handleOrderPlaced(payload: unknown) {
    // handle
  }

  @OnEvent('payment.confirmed')
  handlePaymentConfirmed(payload: unknown) {
    // handle
  }
}

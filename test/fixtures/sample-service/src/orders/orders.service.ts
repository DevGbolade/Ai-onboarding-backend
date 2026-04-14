import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { HttpService } from "@nestjs/axios";

@Injectable()
export class OrdersService {
  constructor(private readonly httpService: HttpService) {}

  @OnEvent("order.placed")
  handleOrderPlaced(payload: { userId: string; total: number }) {
    this.httpService.get(`http://user-service/api/users/${payload.userId}`);
  }

  @OnEvent("payment.confirmed")
  handlePaymentConfirmed(payload: { orderId: string }) {
    return payload;
  }
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class OrdersService {
  constructor(private readonly httpService: any) {}

  async createOrder(userId: string, total: number): Promise<unknown> {
    const user = await this.httpService.get('http://user-service:3001/users/:id').toPromise();
    return { userId, total, user };
  }
}

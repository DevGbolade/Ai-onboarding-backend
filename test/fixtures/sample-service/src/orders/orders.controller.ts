import { Body, Controller, Get, Param, Post } from '@nestjs/common';

class CreateOrderDto {
  userId!: string;
  total!: number;
}

@Controller('orders')
export class OrdersController {
  @Post()
  createOrder(@Body() dto: CreateOrderDto) { return {}; }

  @Get(':id')
  getOrder(@Param('id') id: string) { return {}; }
}

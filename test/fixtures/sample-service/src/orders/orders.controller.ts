import { Body, Controller, Get, Post } from "@nestjs/common";

export class CreateOrderDto {
  userId: string;
  total: number;
}

@Controller("orders")
export class OrdersController {
  @Get()
  getAllOrders() {
    return [];
  }

  @Post()
  createOrder(@Body() createOrderDto: CreateOrderDto) {
    return createOrderDto;
  }
}

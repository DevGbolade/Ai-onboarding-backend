import { Controller, Get, Post, Body, Param } from '@nestjs/common';

class CreateUserDto {
  name!: string;
}

@Controller('users')
export class UsersController {
  @Get()
  findAll() { return []; }

  @Get(':id')
  findOne(@Param('id') id: string) { return {}; }

  @Post()
  create(@Body() dto: CreateUserDto) { return {}; }
}

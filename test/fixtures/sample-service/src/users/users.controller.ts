import { Body, Controller, Get, Param, Post } from "@nestjs/common";

export class CreateUserDto {
  name: string;
  email: string;
}

@Controller("users")
export class UsersController {
  @Get()
  findAll() {
    return [];
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return { id };
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return createUserDto;
  }
}

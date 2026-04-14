import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

@Injectable()
export class UsersService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  createUser(data: { name: string; email: string }) {
    this.eventEmitter.emit("user.created", data);
    this.eventEmitter.emit("user.welcome.sent", { email: data.email });
    return data;
  }
}

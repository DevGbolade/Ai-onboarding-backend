import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("orders")
export class OrderEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  total: number;
}

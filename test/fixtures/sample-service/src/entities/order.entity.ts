import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column('decimal')
  total!: number;

  @Column({ default: 'pending' })
  status!: string;
}

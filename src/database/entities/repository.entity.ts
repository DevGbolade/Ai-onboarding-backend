import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RepositoryStatus } from '../../common/enums/repository-status.enum';
import { ChunkEntity } from './chunk.entity';
import { ServiceNodeEntity } from './service-node.entity';

@Entity('repositories')
export class RepositoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  gitUrl!: string;

  @Column({ default: 'main' })
  branch!: string;

  @Column({ unique: true })
  serviceId!: string;

  @Column({ type: 'timestamp', nullable: true })
  lastIndexed!: Date | null;

  @Column({ type: 'enum', enum: RepositoryStatus, default: RepositoryStatus.PENDING })
  status!: RepositoryStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ChunkEntity, (chunk) => chunk.repository)
  chunks!: ChunkEntity[];

  @OneToOne(() => ServiceNodeEntity, (node) => node.repository)
  serviceNode!: ServiceNodeEntity;
}

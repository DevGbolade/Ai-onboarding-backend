import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RepositoryEntity } from './repository.entity';

@Entity('service_nodes')
export class ServiceNodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  repositoryId!: string;

  @OneToOne(() => RepositoryEntity, (repo) => repo.serviceNode)
  @JoinColumn({ name: 'repositoryId' })
  repository!: RepositoryEntity;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: [] })
  routes!: string[];

  @Column({ type: 'jsonb', default: [] })
  schemas!: string[];

  @Column({ type: 'jsonb', default: [] })
  publishes!: string[];

  @Column({ type: 'jsonb', default: [] })
  subscribes!: string[];

  @Column({ type: 'jsonb', default: [] })
  dependencies!: string[];

  @Column({ type: 'text', nullable: true })
  techStack!: string | null;

  @Column({ type: 'jsonb', default: [] })
  keyFiles!: string[];

  @Column({ type: 'jsonb', default: [] })
  envVars!: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

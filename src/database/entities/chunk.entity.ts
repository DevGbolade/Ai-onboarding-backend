import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChunkType } from '../../common/enums/chunk-type.enum';
import { RepositoryEntity } from './repository.entity';

@Entity('chunks')
@Index(['serviceId'])
export class ChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  repositoryId!: string;

  @ManyToOne(() => RepositoryEntity, (repo) => repo.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repositoryId' })
  repository!: RepositoryEntity;

  @Column()
  serviceId!: string;

  @Column({ type: 'enum', enum: ChunkType })
  chunkType!: ChunkType;

  @Column()
  filePath!: string;

  @Column({ type: 'text' })
  content!: string;

  // IMPORTANT: The `embedding` column is NOT declared here.
  // pgvector's vector(1536) type is not supported by TypeORM.
  // It is created via migration raw SQL and accessed via raw queries only.

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}

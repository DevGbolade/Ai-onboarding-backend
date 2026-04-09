import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { ChunkEntity } from './entities/chunk.entity';
import { DependencyEdgeEntity } from './entities/dependency-edge.entity';
import { RepositoryEntity } from './entities/repository.entity';
import { ServiceNodeEntity } from './entities/service-node.entity';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [RepositoryEntity, ServiceNodeEntity, ChunkEntity, DependencyEdgeEntity],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});

export default AppDataSource;

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChunkEntity } from "./entities/chunk.entity";
import { DependencyEdgeEntity } from "./entities/dependency-edge.entity";
import { RepositoryEntity } from "./entities/repository.entity";
import { ServiceNodeEntity } from "./entities/service-node.entity";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("database.url"),
        entities: [
          RepositoryEntity,
          ServiceNodeEntity,
          ChunkEntity,
          DependencyEdgeEntity,
        ],
        migrations: ["dist/database/migrations/*.js"],
        synchronize: false,
        logging: config.get<string>("nodeEnv") === "development",
      }),
    }),
    TypeOrmModule.forFeature([
      RepositoryEntity,
      ServiceNodeEntity,
      ChunkEntity,
      DependencyEdgeEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

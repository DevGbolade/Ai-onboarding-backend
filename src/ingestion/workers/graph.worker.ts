import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { EdgeType } from '../../common/enums/edge-type.enum';
import { RepositoryStatus } from '../../common/enums/repository-status.enum';
import { DependencyEdgeEntity } from '../../database/entities/dependency-edge.entity';
import { RepositoryEntity } from '../../database/entities/repository.entity';
import { ServiceNodeEntity } from '../../database/entities/service-node.entity';

interface GraphJobData {
  repositoryId: string;
  serviceId: string;
}

@Processor('graph')
export class GraphWorker extends WorkerHost {
  private readonly logger = new Logger('GraphWorker');

  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repositoryRepo: Repository<RepositoryEntity>,
    @InjectRepository(ServiceNodeEntity)
    private readonly serviceNodeRepo: Repository<ServiceNodeEntity>,
    @InjectRepository(DependencyEdgeEntity)
    private readonly edgeRepo: Repository<DependencyEdgeEntity>,
  ) {
    super();
  }

  async process(job: Job<GraphJobData>): Promise<void> {
    const { repositoryId, serviceId } = job.data;

    const repo = await this.repositoryRepo.findOneByOrFail({ id: repositoryId });
    this.logger.log(`Building dependency graph for ${repo.name} (${repositoryId})`);

    try {
      await this.edgeRepo.delete({ fromService: serviceId });

      const thisNode = await this.serviceNodeRepo.findOneBy({ repositoryId });
      if (!thisNode) {
        this.logger.warn(`No ServiceNode found for repositoryId=${repositoryId}, skipping graph build`);
        await this.repositoryRepo.update(repositoryId, {
          status: RepositoryStatus.READY,
          lastIndexed: new Date(),
        });
        return;
      }

      const allNodes = await this.serviceNodeRepo.find();
      const otherNodes = allNodes.filter((n) => n.repositoryId !== repositoryId);

      const newEdges: Partial<DependencyEdgeEntity>[] = [];

      // EVENT MATCHING: publishes → subscribes
      for (const event of thisNode.publishes) {
        for (const other of otherNodes) {
          if (other.subscribes.includes(event)) {
            newEdges.push(
              this.edgeRepo.create({
                fromService: serviceId,
                toService: other.repositoryId,
                edgeType: EdgeType.EVENT_PUB_SUB,
                detail: event,
              }),
            );
          }
        }
      }

      // HTTP MATCHING: parse dependency strings and match against routes
      for (const dep of thisNode.dependencies) {
        const matched = this.matchHttpDependency(dep, otherNodes);
        if (matched) {
          newEdges.push(
            this.edgeRepo.create({
              fromService: serviceId,
              toService: matched.repositoryId,
              edgeType: EdgeType.HTTP_CALL,
              detail: dep,
            }),
          );
        }
      }

      if (newEdges.length > 0) {
        await this.edgeRepo.save(newEdges);
      }

      this.logger.log(`Created ${newEdges.length} dependency edges for ${repo.name}`);

      await this.repositoryRepo.update(repositoryId, {
        status: RepositoryStatus.READY,
        lastIndexed: new Date(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Graph build failed for ${repo.name} (${repositoryId}): ${message}`);

      await this.repositoryRepo.update(repositoryId, {
        status: RepositoryStatus.FAILED,
        metadata: { error: message },
      });
    }
  }

  private matchHttpDependency(
    dep: string,
    nodes: ServiceNodeEntity[],
  ): ServiceNodeEntity | undefined {
    // dep is a URL string like "https://user-service/api/users" or a service name
    let depPath: string;
    try {
      depPath = new URL(dep).pathname;
    } catch {
      depPath = dep;
    }

    for (const node of nodes) {
      for (const route of node.routes) {
        // routes stored as "METHOD /path"
        const routePath = route.split(' ')[1] ?? route;
        if (depPath.includes(routePath) || routePath.includes(depPath)) {
          return node;
        }
      }
    }
    return undefined;
  }
}

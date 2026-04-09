import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DependencyEdgeEntity } from '../database/entities/dependency-edge.entity';
import { ServiceNodeEntity } from '../database/entities/service-node.entity';

@Injectable()
export class GraphService {
  constructor(
    @InjectRepository(DependencyEdgeEntity)
    private readonly edgeRepo: Repository<DependencyEdgeEntity>,
    @InjectRepository(ServiceNodeEntity)
    private readonly serviceNodeRepo: Repository<ServiceNodeEntity>,
  ) {}

  getFullGraph(): Promise<DependencyEdgeEntity[]> {
    return this.edgeRepo.find();
  }

  getServiceDependencies(serviceId: string): Promise<DependencyEdgeEntity[]> {
    return this.edgeRepo
      .createQueryBuilder('edge')
      .where('edge.fromService = :serviceId OR edge.toService = :serviceId', { serviceId })
      .getMany();
  }

  async getTraversalPath(fromServiceId: string, toServiceId: string): Promise<string[]> {
    const edges = await this.edgeRepo.find();

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.fromService)) adjacency.set(edge.fromService, new Set());
      adjacency.get(edge.fromService)!.add(edge.toService);
    }

    // BFS
    const visited = new Set<string>();
    const queue: Array<{ serviceId: string; path: string[] }> = [
      { serviceId: fromServiceId, path: [fromServiceId] },
    ];
    visited.add(fromServiceId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.serviceId === toServiceId) {
        return current.path;
      }

      const neighbors = adjacency.get(current.serviceId) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ serviceId: neighbor, path: [...current.path, neighbor] });
        }
      }
    }

    return [];
  }

  async getAffectedServices(serviceId: string): Promise<DependencyEdgeEntity[]> {
    return this.edgeRepo
      .createQueryBuilder('edge')
      .where('edge.toService = :serviceId', { serviceId })
      .getMany();
  }
}

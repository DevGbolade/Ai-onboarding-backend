import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DependencyEdgeEntity } from "../database/entities/dependency-edge.entity";
import { ServiceNodeEntity } from "../database/entities/service-node.entity";
import { EdgeType } from "../common/enums/edge-type.enum";

export interface GraphNode {
  serviceId: string;
  name: string;
  description: string | null;
  routes: string[];
  schemas: string[];
  publishes: string[];
  subscribes: string[];
  dependencies: string[];
  techStack: string | null;
  envVars: string[];
  keyFiles: string[];
}

export interface EnrichedEdge {
  id: string;
  fromService: string;
  toService: string;
  edgeType: EdgeType;
  detail: string | null;
  fromNode: GraphNode | null;
  toNode: GraphNode | null;
}

export interface FullGraph {
  nodes: GraphNode[];
  edges: DependencyEdgeEntity[];
}

@Injectable()
export class GraphService {
  constructor(
    @InjectRepository(DependencyEdgeEntity)
    private readonly edgeRepo: Repository<DependencyEdgeEntity>,
    @InjectRepository(ServiceNodeEntity)
    private readonly serviceNodeRepo: Repository<ServiceNodeEntity>,
  ) {}

  async getFullGraph(): Promise<FullGraph> {
    const [edges, rawNodes] = await Promise.all([
      this.edgeRepo.find(),
      this.serviceNodeRepo
        .createQueryBuilder("node")
        .innerJoinAndSelect("node.repository", "repo")
        .getMany(),
    ]);

    const nodes = rawNodes.map((n) => this.toGraphNode(n));
    return { nodes, edges };
  }

  async getServiceNode(serviceId: string): Promise<GraphNode | null> {
    const node = await this.serviceNodeRepo
      .createQueryBuilder("node")
      .innerJoinAndSelect("node.repository", "repo")
      .where("repo.serviceId = :serviceId", { serviceId })
      .getOne();

    return node ? this.toGraphNode(node) : null;
  }

  async getServiceDependencies(
    serviceId: string,
  ): Promise<DependencyEdgeEntity[]> {
    return this.edgeRepo
      .createQueryBuilder("edge")
      .where("edge.fromService = :serviceId OR edge.toService = :serviceId", {
        serviceId,
      })
      .getMany();
  }

  async getEnrichedServiceDependencies(
    serviceId: string,
  ): Promise<EnrichedEdge[]> {
    const edges = await this.getServiceDependencies(serviceId);
    return this.enrichEdges(edges);
  }

  async getTraversalPath(
    fromServiceId: string,
    toServiceId: string,
  ): Promise<string[]> {
    const edges = await this.edgeRepo.find();

    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.fromService))
        adjacency.set(edge.fromService, new Set());
      adjacency.get(edge.fromService)!.add(edge.toService);
    }

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
          queue.push({
            serviceId: neighbor,
            path: [...current.path, neighbor],
          });
        }
      }
    }

    return [];
  }

  async getAffectedServices(serviceId: string): Promise<EnrichedEdge[]> {
    const edges = await this.edgeRepo
      .createQueryBuilder("edge")
      .where("edge.toService = :serviceId", { serviceId })
      .getMany();

    return this.enrichEdges(edges);
  }

  private async enrichEdges(
    edges: DependencyEdgeEntity[],
  ): Promise<EnrichedEdge[]> {
    if (edges.length === 0) return [];

    const serviceIds = new Set<string>(
      edges.flatMap((e) => [e.fromService, e.toService]),
    );
    const nodeMap = await this.buildNodeMap([...serviceIds]);

    return edges.map((edge) => ({
      id: edge.id,
      fromService: edge.fromService,
      toService: edge.toService,
      edgeType: edge.edgeType,
      detail: edge.detail,
      fromNode: nodeMap.get(edge.fromService) ?? null,
      toNode: nodeMap.get(edge.toService) ?? null,
    }));
  }

  private async buildNodeMap(
    serviceIds: string[],
  ): Promise<Map<string, GraphNode>> {
    if (serviceIds.length === 0) return new Map();

    const nodes = await this.serviceNodeRepo
      .createQueryBuilder("node")
      .innerJoinAndSelect("node.repository", "repo")
      .where("repo.serviceId = ANY(:serviceIds)", { serviceIds })
      .getMany();

    const map = new Map<string, GraphNode>();
    for (const node of nodes) {
      map.set(node.repository.serviceId, this.toGraphNode(node));
    }
    return map;
  }

  private toGraphNode(node: ServiceNodeEntity): GraphNode {
    return {
      serviceId: node.repository.serviceId,
      name: node.name,
      description: node.description,
      routes: node.routes,
      schemas: node.schemas,
      publishes: node.publishes,
      subscribes: node.subscribes,
      dependencies: node.dependencies,
      techStack: node.techStack,
      envVars: node.envVars,
      keyFiles: node.keyFiles,
    };
  }
}

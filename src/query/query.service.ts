import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChunkType } from '../common/enums/chunk-type.enum';
import { GraphService } from '../knowledge/graph.service';
import { ChunkSearchResult, KnowledgeService } from '../knowledge/knowledge.service';

export interface QuerySource {
  serviceId: string;
  filePath: string;
  chunkType: ChunkType;
  similarity: number;
}

export interface QueryAnswer {
  answer: string;
  consultedServices: string[];
  sources: QuerySource[];
}

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);
  private readonly openai: OpenAI;
  private readonly llmModel: string;

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly graphService: GraphService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.llmModel = this.configService.get<string>('LLM_MODEL') ?? 'gpt-4o';
  }

  async ask(question: string, serviceFilter?: string[]): Promise<QueryAnswer> {
    // Step 1 — Retrieve relevant chunks
    let chunks: ChunkSearchResult[];
    if (serviceFilter && serviceFilter.length > 0) {
      chunks = await this.knowledgeService.searchChunks(question, { serviceIds: serviceFilter });
    } else {
      const grouped = await this.knowledgeService.searchAcrossServices(question);
      chunks = grouped.flatMap((g) => g.chunks);
    }

    if (chunks.length === 0) {
      return {
        answer:
          'No relevant code was found for your question. Try rephrasing it or specify a service using the serviceFilter field.',
        consultedServices: [],
        sources: [],
      };
    }

    // Step 2 — Expand: get connected service context
    const directServiceIds = [...new Set(chunks.map((c) => c.serviceId))];
    const connectedServiceIds = new Set<string>(directServiceIds);

    await Promise.all(
      directServiceIds.map(async (serviceId) => {
        const edges = await this.graphService.getServiceDependencies(serviceId);
        for (const edge of edges) {
          connectedServiceIds.add(edge.fromService);
          connectedServiceIds.add(edge.toService);
        }
      }),
    );

    const allServiceIds = [...connectedServiceIds];
    const serviceContexts = await Promise.all(
      allServiceIds.map(async (serviceId) => ({
        serviceId,
        context: await this.knowledgeService.getServiceContext(serviceId),
      })),
    );

    const edges = await this.graphService.getFullGraph();
    const involvedEdges = edges.filter(
      (e) => connectedServiceIds.has(e.fromService) && connectedServiceIds.has(e.toService),
    );

    // Step 3 — Build prompt
    const chunkSection = chunks
      .map(
        (c) =>
          `[${c.serviceId} | ${c.filePath} | ${c.chunkType}]\n${c.content}`,
      )
      .join('\n\n---\n\n');

    const contextSection = serviceContexts.map((s) => s.context).join('\n\n---\n\n');

    const graphSection =
      involvedEdges.length > 0
        ? involvedEdges
            .map((e) => `${e.fromService} --[${e.edgeType}]--> ${e.toService}${e.detail ? ` (${e.detail})` : ''}`)
            .join('\n')
        : 'No dependency edges found between consulted services.';

    const systemPrompt = `You are a codebase onboarding agent helping new engineers understand a microservices system. You have access to indexed code, service metadata, and the dependency graph.

## Retrieved Code Chunks

${chunkSection}

## Service Context Summaries

${contextSection}

## Dependency Graph (involved services)

${graphSection}

## Instructions

Answer the question by tracing the flow across services. Mention specific routes, events, files, and tables where relevant. Be precise and cite the service and file path when referencing code.`;

    // Step 4 — Call LLM
    this.logger.log(`Calling ${this.llmModel} for question: "${question.slice(0, 80)}..."`);

    const completion = await this.openai.chat.completions.create({
      model: this.llmModel,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? 'No answer generated.';

    // Step 5 — Return
    return {
      answer,
      consultedServices: allServiceIds,
      sources: chunks.map((c) => ({
        serviceId: c.serviceId,
        filePath: c.filePath,
        chunkType: c.chunkType,
        similarity: c.similarity,
      })),
    };
  }
}

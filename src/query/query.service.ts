import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { ChunkType } from "../common/enums/chunk-type.enum";
import { GraphService } from "../knowledge/graph.service";
import {
  ChunkSearchResult,
  KnowledgeService,
} from "../knowledge/knowledge.service";

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
  confidenceScore: number;
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
      apiKey: this.configService.get<string>("openai.apiKey"),
    });
    this.llmModel =
      this.configService.get<string>("openai.llmModel") ?? "gpt-4o";
  }

  async ask(question: string, serviceFilter?: string[]): Promise<QueryAnswer> {
    // Step 1 — Retrieve relevant chunks
    let chunks: ChunkSearchResult[];
    if (serviceFilter && serviceFilter.length > 0) {
      chunks = await this.knowledgeService.searchChunks(question, {
        serviceIds: serviceFilter,
      });
    } else {
      const grouped =
        await this.knowledgeService.searchAcrossServices(question);
      chunks = grouped.flatMap((g) => g.chunks);
    }

    if (chunks.length === 0) {
      return {
        answer:
          "No relevant code was found for your question. Try rephrasing it or specify a service using the serviceFilter field.",
        consultedServices: [],
        sources: [],
        confidenceScore: 0,
      };
    }

    // Compute confidence from primary retrieval only — follow-the-code chunks carry
    // an artificial 1.0 score that would misrepresent retrieval quality.
    const maxSimilarity = Math.max(...chunks.map((c) => c.similarity));

    // Step 1b — Follow-the-code: find implementations of service methods called in chunks.
    // Extracts method names from patterns like `this.fooService.doBar(` and searches for
    // their implementations so cross-service traces don't stop at the call site.
    const serviceCallPattern =
      /this\.(?:\w+(?:Service|Client|Provider|Gateway))\.([\w]{6,})\(/g;
    const methodQueries = new Set<string>();
    for (const chunk of chunks) {
      let match: RegExpExecArray | null;
      const re = new RegExp(serviceCallPattern.source, "g");
      while ((match = re.exec(chunk.content)) !== null) {
        methodQueries.add(match[1]);
      }
    }

    if (methodQueries.size > 0) {
      // Use exact text search (ILIKE) — not semantic search — to find method implementations.
      // Semantic search on method names causes false positives (e.g. "initiateIbanAllocation"
      // semantically matches loyalty "allocate" methods). ILIKE only matches files that
      // actually reference or define the extracted method name.
      const existingIds = new Set(chunks.map((c) => c.id));
      const followChunks = await this.knowledgeService.findChunksByKeyword(
        [...methodQueries].slice(0, 6),
        { limit: 6 },
      );
      chunks = [
        ...chunks,
        ...followChunks.filter((c) => !existingIds.has(c.id)),
      ];
    }
    // text-embedding-3-small genuine matches land at 0.25–0.45.
    // Guard only blocks truly irrelevant queries (< 0.2).
    const minConfidence =
      this.configService.get<number>("ingestion.minAnswerConfidence") ?? 0.2;

    if (maxSimilarity < minConfidence) {
      return {
        answer: `No high-confidence matches found in the indexed codebase (best similarity: ${maxSimilarity.toFixed(2)}). The relevant service may not be indexed yet, or try rephrasing your question. You can also specify a serviceFilter to search within a known service.`,
        consultedServices: [],
        sources: chunks.map((c) => ({
          serviceId: c.serviceId,
          filePath: c.filePath,
          chunkType: c.chunkType,
          similarity: c.similarity,
        })),
        confidenceScore: maxSimilarity,
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

    const { edges: allEdges, nodes: allNodes } =
      await this.graphService.getFullGraph();
    const involvedEdges = allEdges.filter(
      (e) =>
        connectedServiceIds.has(e.fromService) &&
        connectedServiceIds.has(e.toService),
    );
    const involvedNodes = allNodes.filter((n) =>
      connectedServiceIds.has(n.serviceId),
    );

    // Step 3 — Build prompt
    const chunkSection = chunks
      .map(
        (c) =>
          `[${c.serviceId} | ${c.filePath} | ${c.chunkType}]\n${c.content}`,
      )
      .join("\n\n---\n\n");

    const contextSection = involvedNodes
      .map((n) => {
        const lines: string[] = [`Service: ${n.name}`];
        if (n.description) lines.push(`Description: ${n.description}`);
        if (n.techStack) lines.push(`Tech Stack: ${n.techStack}`);
        if (n.routes.length > 0) lines.push(`Routes: ${n.routes.join(", ")}`);
        if (n.schemas.length > 0)
          lines.push(`Schemas/Entities: ${n.schemas.join(", ")}`);
        if (n.publishes.length > 0)
          lines.push(`Publishes Events: ${n.publishes.join(", ")}`);
        if (n.subscribes.length > 0)
          lines.push(`Subscribes Events: ${n.subscribes.join(", ")}`);
        if (n.envVars.length > 0)
          lines.push(`Environment Variables: ${n.envVars.join(", ")}`);
        if (n.keyFiles.length > 0)
          lines.push(`Key Files: ${n.keyFiles.join(", ")}`);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const graphSection =
      involvedEdges.length > 0
        ? involvedEdges
            .map(
              (e) =>
                `${e.fromService} --[${e.edgeType}]--> ${e.toService}${e.detail ? ` (${e.detail})` : ""}`,
            )
            .join("\n")
        : "No dependency edges found between consulted services.";

    const systemPrompt = `You are a codebase onboarding agent helping new engineers understand a microservices system. You have access to indexed code, service metadata, and the dependency graph.

## Retrieved Code Chunks

${chunkSection}

## Service Context Summaries

${contextSection}

## Dependency Graph (involved services)

${graphSection}

## Instructions

Answer ONLY using the Retrieved Code Chunks and Service Context provided above. Do NOT use general knowledge or infer implementation details not present in the chunks.

For questions about flows or processes, trace the full execution path visible in the chunks:
- Start from the entry point (controller, webhook, or public method) if present.
- When a chunk shows a call like \`this.fooService.doBar(...)\`, look for another chunk that implements \`doBar\` and continue the trace from there.
- Describe each hop: which file calls what, with what arguments, and what the called code does.
- If a called method's implementation is not in any chunk, name the file it would be in and stop the trace at that point.

If one service dominates the retrieved chunks, focus your answer on that service and only mention other services if the chunks explicitly show an interaction with them.
Cite specific file paths, routes, events, or entity names only when they appear in the chunks above.
If the context is insufficient to fully answer, describe only what you found in the chunks and state which file or service would contain the missing detail. Do NOT give generic steps, bullet-pointed advice, or "typically you would..." guidance. Stop after explaining what the indexed code reveals.`;

    // Step 4 — Call LLM
    this.logger.log(
      `Calling ${this.llmModel} for question: "${question.slice(0, 80)}..."`,
    );

    const completion = await this.openai.chat.completions.create({
      model: this.llmModel,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });

    const answer =
      completion.choices[0]?.message?.content ?? "No answer generated.";

    // Step 5 — Return
    return {
      answer,
      consultedServices: [...connectedServiceIds],
      sources: chunks.map((c) => ({
        serviceId: c.serviceId,
        filePath: c.filePath,
        chunkType: c.chunkType,
        similarity: c.similarity,
      })),
      confidenceScore: maxSimilarity,
    };
  }
}

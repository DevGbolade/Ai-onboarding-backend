import { Injectable } from "@nestjs/common";
import { Node, Project } from "ts-morph";
import { ExtractedMetadata } from "../../common/interfaces/extracted-metadata.interface";
import { BaseExtractor } from "./base.extractor";

// Calls that publish events or dispatch jobs
const EMIT_METHODS = new Set(["emit", "emitAsync", "add", "send"]);

// Method-level decorators that mark a handler as subscribing to an event/pattern
const SUBSCRIBE_METHOD_DECORATORS = new Set([
  "OnEvent", // EventEmitter2
  "Process", // BullMQ @Process('job-name') on methods
  "MessagePattern", // NestJS microservice RPC
  "EventPattern", // NestJS microservice event
  "SubscribeMessage", // WebSocket gateways
]);

// Class-level decorators whose first argument is a queue/channel name this service subscribes to
const SUBSCRIBE_CLASS_DECORATORS = new Set([
  "Processor", // BullMQ @Processor('queue-name') on class
]);

// Constructor parameter decorators that identify queues this service publishes to
const INJECT_QUEUE_DECORATORS = new Set(["InjectQueue"]);

@Injectable()
export class EventExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const project = new Project({ skipAddingFilesFromTsConfig: true });

    const files = this.findFiles(projectPath, "src/**/*.ts");
    project.addSourceFilesAtPaths(files);

    const publishedEvents = new Set<string>();
    const subscribedEvents = new Set<string>();

    for (const sourceFile of project.getSourceFiles()) {
      // ── Published: emit/emitAsync/add/send call expressions ──────────────
      sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;

        const expr = node.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) return;

        const methodName = expr.getName();
        if (!EMIT_METHODS.has(methodName)) return;

        const args = node.getArguments();
        if (args.length === 0) return;

        const firstArg = args[0];
        if (Node.isStringLiteral(firstArg)) {
          publishedEvents.add(firstArg.getLiteralValue());
        }
      });

      for (const cls of sourceFile.getClasses()) {
        // ── Subscribed: class-level @Processor('queue-name') ─────────────
        for (const dec of cls.getDecorators()) {
          if (!SUBSCRIBE_CLASS_DECORATORS.has(dec.getName())) continue;

          const args = dec.getArguments();
          if (args.length === 0) continue;

          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            subscribedEvents.add(`queue:${firstArg.getLiteralValue()}`);
          }
        }

        // ── Published: @InjectQueue('queue-name') in constructor params ───
        const ctor = cls.getConstructors()[0];
        if (ctor) {
          for (const param of ctor.getParameters()) {
            for (const dec of param.getDecorators()) {
              if (!INJECT_QUEUE_DECORATORS.has(dec.getName())) continue;

              const args = dec.getArguments();
              if (args.length === 0) continue;

              const firstArg = args[0];
              if (Node.isStringLiteral(firstArg)) {
                publishedEvents.add(`queue:${firstArg.getLiteralValue()}`);
              }
            }
          }
        }

        // ── Subscribed: method-level event/pattern decorators ─────────────
        for (const method of cls.getMethods()) {
          for (const dec of method.getDecorators()) {
            if (!SUBSCRIBE_METHOD_DECORATORS.has(dec.getName())) continue;

            const args = dec.getArguments();
            if (args.length === 0) continue;

            const firstArg = args[0];
            if (Node.isStringLiteral(firstArg)) {
              subscribedEvents.add(firstArg.getLiteralValue());
            }
          }
        }
      }
    }

    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }

    return {
      publishedEvents: Array.from(publishedEvents),
      subscribedEvents: Array.from(subscribedEvents),
    };
  }
}

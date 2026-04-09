import { Injectable } from '@nestjs/common';
import { Node, Project } from 'ts-morph';
import { ExtractedMetadata } from '../../common/interfaces/extracted-metadata.interface';
import { BaseExtractor } from './base.extractor';

const EMIT_METHODS = new Set(['emit', 'add']);
const SUBSCRIBE_DECORATORS = new Set(['OnEvent', 'Process']);

@Injectable()
export class EventExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const project = new Project({ skipAddingFilesFromTsConfig: true });

    const files = this.findFiles(projectPath, 'src/**/*.ts');
    project.addSourceFilesAtPaths(files);

    const publishedEvents = new Set<string>();
    const subscribedEvents = new Set<string>();

    for (const sourceFile of project.getSourceFiles()) {
      // Published events: this.eventEmitter.emit('name') / queue.add('name')
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

      // Subscribed events: @OnEvent('name') / @Process('name') on methods
      for (const cls of sourceFile.getClasses()) {
        for (const method of cls.getMethods()) {
          for (const dec of method.getDecorators()) {
            if (!SUBSCRIBE_DECORATORS.has(dec.getName())) continue;

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

import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Node, Project } from 'ts-morph';
import { DependencyInfo, ExtractedMetadata } from '../../common/interfaces/extracted-metadata.interface';
import { BaseExtractor } from './base.extractor';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'request']);
const CLIENT_METHODS = new Set(['send', 'emit']);


@Injectable()
export class DependencyExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const dependencies: DependencyInfo[] = [];

    await this.extractFromSource(projectPath, dependencies);
    this.extractFromDockerCompose(projectPath, dependencies);

    return { dependencies };
  }

  private async extractFromSource(projectPath: string, dependencies: DependencyInfo[]): Promise<void> {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const files = this.findFiles(projectPath, 'src/**/*.ts');
    project.addSourceFilesAtPaths(files);

    for (const sourceFile of project.getSourceFiles()) {
      sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;

        const expr = node.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) return;

        const methodName = expr.getName();
        const args = node.getArguments();

        // this.httpService.get/post/.../('url')
        if (HTTP_METHODS.has(methodName) && args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            const url = firstArg.getLiteralValue();
            dependencies.push({
              targetService: this.extractHostFromUrl(url),
              type: 'http',
              detail: url,
            });
          }
          return;
        }

        // this.client.send/emit('pattern', data)
        if (CLIENT_METHODS.has(methodName) && args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            const pattern = firstArg.getLiteralValue();
            dependencies.push({
              targetService: pattern,
              type: 'event',
              detail: pattern,
            });
          }
        }
      });
    }

    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }
  }

  private extractFromDockerCompose(projectPath: string, dependencies: DependencyInfo[]): void {
    const composePath = path.join(projectPath, 'docker-compose.yml');
    if (!fs.existsSync(composePath)) return;

    try {
      // Minimal YAML parsing for depends_on — avoid adding a yaml dep
      const content = fs.readFileSync(composePath, 'utf-8');
      const dependsOnMatches = content.matchAll(/depends_on:\s*\n((?:\s+-\s+\S+\n?)+)/g);
      for (const match of dependsOnMatches) {
        const serviceLines = match[1].trim().split('\n');
        for (const line of serviceLines) {
          const service = line.replace(/^\s*-\s*/, '').trim();
          if (service) {
            dependencies.push({
              targetService: service,
              type: 'import',
              detail: `docker-compose depends_on: ${service}`,
            });
          }
        }
      }
    } catch {
      // ignore parse failures
    }
  }

  private extractHostFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }
}

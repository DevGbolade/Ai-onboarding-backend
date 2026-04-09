import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { Node, ObjectLiteralExpression, Project } from 'ts-morph';
import { ExtractedMetadata, RouteInfo } from '../../common/interfaces/extracted-metadata.interface';
import { BaseExtractor } from './base.extractor';

const HTTP_METHOD_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);

function resolveDecoratorPrefix(decoratorName: string): string {
  const map: Record<string, string> = {
    Get: 'GET',
    Post: 'POST',
    Put: 'PUT',
    Patch: 'PATCH',
    Delete: 'DELETE',
  };
  return map[decoratorName] ?? decoratorName.toUpperCase();
}

function extractStringArg(args: Node[]): string {
  if (args.length === 0) return '';

  const first = args[0];

  // @Controller({ path: 'x' }) object syntax
  if (Node.isObjectLiteralExpression(first)) {
    const obj = first as ObjectLiteralExpression;
    const pathProp = obj.getProperty('path');
    if (pathProp && Node.isPropertyAssignment(pathProp)) {
      const init = pathProp.getInitializer();
      if (init && Node.isStringLiteral(init)) {
        return init.getLiteralValue();
      }
    }
    return '';
  }

  // @Controller('prefix') string literal syntax
  if (Node.isStringLiteral(first)) {
    return first.getLiteralValue();
  }

  return '';
}

@Injectable()
export class NestjsExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const project = new Project({ skipAddingFilesFromTsConfig: true });

    const files = this.findFiles(projectPath, 'src/**/*.ts');
    project.addSourceFilesAtPaths(files);

    const routes: RouteInfo[] = [];

    for (const sourceFile of project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath();

      for (const cls of sourceFile.getClasses()) {
        const controllerDec = cls
          .getDecorators()
          .find((d) => d.getName() === 'Controller');

        if (!controllerDec) continue;

        const controllerArgs = controllerDec.getArguments();
        const prefix = extractStringArg(controllerArgs);

        for (const method of cls.getMethods()) {
          for (const dec of method.getDecorators()) {
            const decName = dec.getName();
            if (!HTTP_METHOD_DECORATORS.has(decName)) continue;

            const httpMethod = resolveDecoratorPrefix(decName);
            const methodArgs = dec.getArguments();
            const routePath = extractStringArg(methodArgs);

            const fullPath = [prefix, routePath].filter(Boolean).join('/');

            // Look for @Body() parameters to find DTO class names
            let dto: string | undefined;
            for (const param of method.getParameters()) {
              const bodyDec = param.getDecorators().find((d) => d.getName() === 'Body');
              if (!bodyDec) continue;
              const typeNode = param.getTypeNode();
              if (typeNode) {
                dto = typeNode.getText();
              } else {
                const typeRef = param
                  .getType()
                  .getSymbol()
                  ?.getName();
                if (typeRef) dto = typeRef;
              }
            }

            // Extract @Param() parameter names
            const params: string[] = [];
            for (const param of method.getParameters()) {
              const paramDec = param.getDecorators().find((d) => d.getName() === 'Param');
              if (!paramDec) continue;
              const paramArgs = paramDec.getArguments();
              if (paramArgs.length > 0 && Node.isStringLiteral(paramArgs[0])) {
                params.push(paramArgs[0].getLiteralValue());
              }
            }

            const route: RouteInfo = {
              method: httpMethod,
              path: fullPath,
              handler: method.getName() ?? '',
              filePath: path.relative(projectPath, filePath),
              ...(params.length > 0 && { params }),
              ...(dto !== undefined && { dto }),
            };

            routes.push(route);
          }
        }
      }
    }

    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }

    return { routes };
  }
}

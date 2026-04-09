import { Injectable } from '@nestjs/common';
import { Node, Project } from 'ts-morph';
import { ExtractedMetadata } from '../../common/interfaces/extracted-metadata.interface';
import { BaseExtractor } from './base.extractor';

@Injectable()
export class TypeormExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const project = new Project({ skipAddingFilesFromTsConfig: true });

    // Primary signal: .entity.ts files; fallback to all ts files
    const entityFiles = this.findFiles(projectPath, 'src/**/*.entity.ts');
    const allFiles = entityFiles.length > 0
      ? entityFiles
      : this.findFiles(projectPath, 'src/**/*.ts');

    project.addSourceFilesAtPaths(allFiles);

    const schemas: string[] = [];

    for (const sourceFile of project.getSourceFiles()) {
      for (const cls of sourceFile.getClasses()) {
        const entityDec = cls.getDecorators().find((d) => d.getName() === 'Entity');
        if (!entityDec) continue;

        const args = entityDec.getArguments();
        let tableName: string;

        if (args.length === 0) {
          // @Entity() — default to class name lowercased
          tableName = cls.getName() ?? 'unknown';
        } else if (Node.isStringLiteral(args[0])) {
          // @Entity('table_name')
          tableName = args[0].getLiteralValue();
        } else if (Node.isObjectLiteralExpression(args[0])) {
          // @Entity({ name: 'table_name' })
          const nameProp = args[0].getProperty('name');
          if (nameProp && Node.isPropertyAssignment(nameProp)) {
            const init = nameProp.getInitializer();
            tableName = init && Node.isStringLiteral(init)
              ? init.getLiteralValue()
              : (cls.getName() ?? 'unknown');
          } else {
            tableName = cls.getName() ?? 'unknown';
          }
        } else {
          tableName = cls.getName() ?? 'unknown';
        }

        schemas.push(tableName);
      }
    }

    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }

    return { schemas };
  }
}

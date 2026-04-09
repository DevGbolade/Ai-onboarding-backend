import { globSync } from 'glob';
import * as path from 'path';
import { ExtractedMetadata } from '../../common/interfaces/extracted-metadata.interface';

export abstract class BaseExtractor {
  abstract extract(projectPath: string): Promise<Partial<ExtractedMetadata>>;

  protected findFiles(projectPath: string, pattern: string): string[] {
    return globSync(pattern, {
      cwd: projectPath,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
      ],
    }).map((f) => path.normalize(f));
  }
}

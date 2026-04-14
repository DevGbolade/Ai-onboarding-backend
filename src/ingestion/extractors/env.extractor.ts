import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { Node, Project } from "ts-morph";
import { ExtractedMetadata } from "../../common/interfaces/extracted-metadata.interface";
import { BaseExtractor } from "./base.extractor";

@Injectable()
export class EnvExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const envVars = new Set<string>();

    // Strategy 1: parse .env.example or .env.sample
    for (const candidate of [".env.example", ".env.sample"]) {
      const filePath = path.join(projectPath, candidate);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            envVars.add(trimmed.slice(0, eqIdx).trim());
          }
        }
        break;
      }
    }

    // Strategy 2: ts-morph scan for configService.get('VAR') and process.env.VAR
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const files = this.findFiles(projectPath, "src/**/*.ts");
    project.addSourceFilesAtPaths(files);

    for (const sourceFile of project.getSourceFiles()) {
      sourceFile.forEachDescendant((node) => {
        // configService.get('VAR_NAME') or configService.get<T>('VAR_NAME')
        if (Node.isCallExpression(node)) {
          const expr = node.getExpression();
          if (
            Node.isPropertyAccessExpression(expr) &&
            expr.getName() === "get"
          ) {
            const receiver = expr.getExpression().getText();
            if (!receiver.toLowerCase().includes("config")) return;
            const args = node.getArguments();
            if (args.length > 0 && Node.isStringLiteral(args[0])) {
              envVars.add(args[0].getLiteralValue());
            }
          }
          return;
        }

        // process.env.VAR_NAME
        if (Node.isPropertyAccessExpression(node)) {
          const obj = node.getExpression();
          if (
            Node.isPropertyAccessExpression(obj) &&
            obj.getName() === "env" &&
            Node.isIdentifier(obj.getExpression()) &&
            obj.getExpression().getText() === "process"
          ) {
            envVars.add(node.getName());
          }
        }
      });
    }

    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }

    return { envVars: Array.from(envVars) };
  }
}

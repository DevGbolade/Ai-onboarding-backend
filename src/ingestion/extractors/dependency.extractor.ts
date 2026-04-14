import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { Node, Project } from "ts-morph";
import {
  DependencyInfo,
  ExtractedMetadata,
} from "../../common/interfaces/extracted-metadata.interface";
import { BaseExtractor } from "./base.extractor";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "request",
]);
// Tighter list — "service", "api", "client" removed to avoid matching every NestJS service/cache/redis client
const HTTP_CLIENT_HINTS = ["http", "axios", "fetch", "request"];

// Separate stricter list for microservice TCP/Redis transport clients
const MICROSERVICE_CLIENT_HINTS = ["client", "microservice", "transport"];

function isHttpClientObject(objectText: string): boolean {
  const lower = objectText.toLowerCase();
  return HTTP_CLIENT_HINTS.some((hint) => lower.includes(hint));
}

function isMicroserviceClientObject(objectText: string): boolean {
  const lower = objectText.toLowerCase();
  return MICROSERVICE_CLIENT_HINTS.some((hint) => lower.includes(hint));
}

// Only absolute URLs indicate a real external dependency — relative paths are local routes
function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

@Injectable()
export class DependencyExtractor extends BaseExtractor {
  async extract(projectPath: string): Promise<Partial<ExtractedMetadata>> {
    const dependencies: DependencyInfo[] = [];

    await this.extractFromSource(projectPath, dependencies);
    this.extractFromDockerCompose(projectPath, dependencies);

    return { dependencies };
  }

  private async extractFromSource(
    projectPath: string,
    dependencies: DependencyInfo[],
  ): Promise<void> {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const files = this.findFiles(projectPath, "src/**/*.ts");
    project.addSourceFilesAtPaths(files);

    for (const sourceFile of project.getSourceFiles()) {
      sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;

        const expr = node.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) return;

        const methodName = expr.getName();
        const args = node.getArguments();
        const objectText = expr.getExpression().getText();

        // this.httpService.get/post/.../('url') — only match HTTP client objects with URL-like args
        if (
          HTTP_METHODS.has(methodName) &&
          args.length > 0 &&
          isHttpClientObject(objectText)
        ) {
          const firstArg = args[0];

          if (Node.isStringLiteral(firstArg)) {
            const url = firstArg.getLiteralValue();
            // Require an absolute URL — relative paths are local route strings, not service calls
            if (!isAbsoluteUrl(url)) return;
            dependencies.push({
              targetService: this.extractHostFromUrl(url),
              type: "http",
              detail: url,
            });
          } else if (Node.isTemplateExpression(firstArg)) {
            // Only capture if the head is an absolute URL, or the first interpolation
            // references a URL/base/host/endpoint variable: `${this.paymentServiceUrl}/charge`
            const head = firstArg.getHead().getLiteralText();
            const spans = firstArg.getTemplateSpans();
            const firstSpanText = spans[0]?.getExpression().getText() ?? "";
            const firstSpanLiteral =
              spans[0]?.getLiteral().getLiteralText() ?? "";

            if (isAbsoluteUrl(head)) {
              dependencies.push({
                targetService: this.extractHostFromUrl(head),
                type: "http",
                detail: `${head}${firstSpanLiteral}`,
              });
            } else if (
              head === "" &&
              this.looksLikeUrlVariable(firstSpanText)
            ) {
              const serviceHint = this.inferServiceFromVariable(firstSpanText);
              if (serviceHint) {
                dependencies.push({
                  targetService: serviceHint,
                  type: "http",
                  detail: firstSpanLiteral || firstSpanText,
                });
              }
            }
          }
          return;
        }

        // ── Microservice client calls: this.paymentClient.send('cmd', data) ──
        if (
          (methodName === "send" || methodName === "emit") &&
          args.length > 0 &&
          isMicroserviceClientObject(objectText)
        ) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            const pattern = firstArg.getLiteralValue();
            dependencies.push({
              targetService: pattern,
              type: "event",
              detail: pattern,
            });
          } else if (Node.isObjectLiteralExpression(firstArg)) {
            // { cmd: 'get_user' } object pattern
            const cmdProp = firstArg.getProperty("cmd");
            if (cmdProp && Node.isPropertyAssignment(cmdProp)) {
              const init = cmdProp.getInitializer();
              if (init && Node.isStringLiteral(init)) {
                const pattern = init.getLiteralValue();
                dependencies.push({
                  targetService: pattern,
                  type: "event",
                  detail: pattern,
                });
              }
            }
          }
        }
      });
    }

    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }
  }

  private extractFromDockerCompose(
    projectPath: string,
    dependencies: DependencyInfo[],
  ): void {
    const composePath = path.join(projectPath, "docker-compose.yml");
    if (!fs.existsSync(composePath)) return;

    try {
      // Minimal YAML parsing for depends_on — avoid adding a yaml dep
      const content = fs.readFileSync(composePath, "utf-8");
      const dependsOnMatches = content.matchAll(
        /depends_on:\s*\n((?:\s+-\s+\S+\n?)+)/g,
      );
      for (const match of dependsOnMatches) {
        const serviceLines = match[1].trim().split("\n");
        for (const line of serviceLines) {
          const service = line.replace(/^\s*-\s*/, "").trim();
          if (service) {
            dependencies.push({
              targetService: service,
              type: "import",
              detail: `docker-compose depends_on: ${service}`,
            });
          }
        }
      }
    } catch {
      // ignore parse failures
    }
  }

  private looksLikeUrlVariable(varText: string): boolean {
    const lower = varText.toLowerCase();
    return (
      lower.includes("url") ||
      lower.includes("uri") ||
      lower.includes("base") ||
      lower.includes("host") ||
      lower.includes("endpoint")
    );
  }

  private inferServiceFromVariable(varText: string): string {
    return (
      varText
        .split(".")
        .pop()
        ?.replace(/url|uri|base|host|endpoint|service/gi, "")
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase()
        .replace(/^-/, "")
        .replace(/-+/g, "-")
        .trim() ?? ""
    );
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

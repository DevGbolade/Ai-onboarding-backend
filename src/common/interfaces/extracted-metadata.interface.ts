export interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  filePath: string;
  params?: string[];
  dto?: string;
}

export interface DependencyInfo {
  targetService: string;
  type: 'http' | 'event' | 'import';
  detail: string;
}

export interface ExtractedMetadata {
  routes: RouteInfo[];
  schemas: string[];
  publishedEvents: string[];
  subscribedEvents: string[];
  dependencies: DependencyInfo[];
  envVars: string[];
  keyFiles: string[];
  description: string;
  techStack: string;
}

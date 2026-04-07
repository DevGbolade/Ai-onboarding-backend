export interface IServiceNode {
  id: string;
  repositoryId: string;
  name: string;
  description: string | null;
  routes: string[];
  schema: string[];
  publishes: string[];
  subscribes: string[];
  dependencies: string[];
  techStack: string | null;
  keyFiles: string[];
  envVars: string[];
  createdAt: Date;
  updatedAt: Date;
}

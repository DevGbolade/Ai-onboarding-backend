import { IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterRepoDto {
  @IsString()
  name!: string;

  @IsUrl({ protocols: ['https', 'ssh', 'git'], require_protocol: false })
  gitUrl!: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsString()
  serviceId!: string;
}

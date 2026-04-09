import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterRepoDto {
  @ApiProperty({
    description: 'Human-readable name for the service',
    example: 'user-service',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Git clone URL (HTTPS or SSH)',
    example: 'https://github.com/your-org/user-service.git',
  })
  @IsUrl()
  gitUrl!: string;

  @ApiPropertyOptional({
    description: 'Branch to track. Defaults to main.',
    example: 'main',
    default: 'main',
  })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    description: 'Stable identifier for this service used across the dependency graph and vector index',
    example: 'user-service',
  })
  @IsString()
  serviceId!: string;
}

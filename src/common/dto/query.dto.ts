import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class AskQueryDto {
  @ApiProperty({
    description: 'Natural language question about the codebase',
    example: 'How does a new user get created and what events are published?',
  })
  @IsString()
  question!: string;

  @ApiPropertyOptional({
    description: 'Restrict the search to specific service IDs. Omit to search across all indexed services.',
    example: ['user-service', 'notification-service'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceFilter?: string[];
}

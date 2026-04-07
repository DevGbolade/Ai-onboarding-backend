import { IsArray, IsOptional, IsString } from 'class-validator';

export class AskQueryDto {
  @IsString()
  question!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceFilter?: string[];
}

import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AskQueryDto } from '../common/dto/query.dto';
import { GraphService } from '../knowledge/graph.service';
import { QueryService } from './query.service';

@ApiTags('query')
@Controller()
export class QueryController {
  constructor(
    private readonly queryService: QueryService,
    private readonly graphService: GraphService,
  ) {}

  @Post('query/ask')
  @ApiOperation({ summary: 'Ask a cross-service question (RAG)' })
  ask(@Body() dto: AskQueryDto) {
    return this.queryService.ask(dto.question, dto.serviceFilter);
  }

  @Get('graph')
  @ApiOperation({ summary: 'Get the full service dependency graph' })
  getGraph() {
    return this.graphService.getFullGraph();
  }
}

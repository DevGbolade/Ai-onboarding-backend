import { Body, Controller, Get, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterRepoDto } from '../common/dto/register-repo.dto';
import { RepositoryEntity } from '../database/entities/repository.entity';
import { RepositoryStatus } from '../common/enums/repository-status.enum';

@ApiTags('repos')
@Controller('repos')
export class ReposController {
  private readonly logger = new Logger(ReposController.name);

  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repositoryRepo: Repository<RepositoryEntity>,
    @InjectQueue('clone')
    private readonly cloneQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all registered repositories with service node data' })
  listRepos() {
    return this.repositoryRepo.find({ relations: ['serviceNode'] });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new repository for indexing' })
  async registerRepo(@Body() dto: RegisterRepoDto) {
    const repo = await this.repositoryRepo.save(
      this.repositoryRepo.create({
        name: dto.name,
        gitUrl: dto.gitUrl,
        branch: dto.branch ?? 'main',
        serviceId: dto.serviceId,
        status: RepositoryStatus.PENDING,
        lastIndexed: null,
        metadata: null,
      }),
    );

    await this.cloneQueue.add('clone', { repositoryId: repo.id, serviceId: repo.serviceId });
    this.logger.log(`Registered repo ${repo.name} (${repo.id}), clone job enqueued`);

    return repo;
  }

  @Post(':id/reindex')
  @ApiOperation({ summary: 'Trigger a manual reindex for an existing repository' })
  async reindex(@Param('id') id: string) {
    const repo = await this.repositoryRepo.findOneByOrFail({ id }).catch(() => {
      throw new NotFoundException(`Repository ${id} not found`);
    });

    await this.repositoryRepo.update(id, { status: RepositoryStatus.PENDING });
    await this.cloneQueue.add('clone', { repositoryId: repo.id, serviceId: repo.serviceId });
    this.logger.log(`Reindex triggered for repo ${repo.name} (${id})`);

    return { message: 'Reindex started', repositoryId: id };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single repository with its service node' })
  async getRepo(@Param('id') id: string) {
    const repo = await this.repositoryRepo.findOne({
      where: { id },
      relations: ['serviceNode'],
    });
    if (!repo) throw new NotFoundException(`Repository ${id} not found`);
    return repo;
  }
}

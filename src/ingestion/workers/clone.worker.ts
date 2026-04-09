import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import * as fs from 'fs';
import simpleGit from 'simple-git';
import { Repository } from 'typeorm';
import { RepositoryStatus } from '../../common/enums/repository-status.enum';
import { RepositoryEntity } from '../../database/entities/repository.entity';

interface CloneJobData {
  repositoryId: string;
  serviceId: string;
}

@Processor('clone')
export class CloneWorker extends WorkerHost {
  private readonly logger = new Logger('CloneWorker');

  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repositoryRepo: Repository<RepositoryEntity>,
    @InjectQueue('extract')
    private readonly extractQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<CloneJobData>): Promise<void> {
    const { repositoryId } = job.data;

    const repo = await this.repositoryRepo.findOneByOrFail({ id: repositoryId });
    const { gitUrl, branch, serviceId } = repo;

    const cloneBasePath = this.configService.get<string>('CLONE_BASE_PATH') ?? '/tmp/repos';
    const projectPath = `${cloneBasePath}/${serviceId}`;

    this.logger.log(`Starting clone for repository ${repo.name} (${repositoryId}) → ${projectPath}`);

    await this.repositoryRepo.update(repositoryId, { status: RepositoryStatus.CLONING });

    try {
      if (fs.existsSync(projectPath)) {
        this.logger.log(`Directory exists, running git pull for ${repo.name}`);
        await simpleGit(projectPath).pull();
      } else {
        this.logger.log(`Cloning ${gitUrl} branch=${branch} into ${projectPath}`);
        await simpleGit().clone(gitUrl, projectPath, ['--branch', branch, '--single-branch']);
      }

      await this.repositoryRepo.update(repositoryId, { status: RepositoryStatus.EXTRACTING });

      await this.extractQueue.add('extract', { repositoryId, serviceId, projectPath });

      this.logger.log(`Clone succeeded for ${repo.name} (${repositoryId}), extract job queued`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Clone failed for ${repo.name} (${repositoryId}): ${message}`);

      await this.repositoryRepo.update(repositoryId, {
        status: RepositoryStatus.FAILED,
        metadata: { error: message },
      });
    }
  }
}

import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { Repository } from "typeorm";
import { RepositoryStatus } from "../common/enums/repository-status.enum";
import { RepositoryEntity } from "../database/entities/repository.entity";

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repoRepository: Repository<RepositoryEntity>,
    @InjectQueue("clone")
    private readonly cloneQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  verifySignature(payload: Buffer, signature: string): boolean {
    const secret = this.configService.get<string>("github.webhookSecret");
    if (!secret) {
      return false;
    }
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }

  async handlePush(
    repoUrl: string,
    branch: string,
  ): Promise<{ repositoryId: string }> {
    const repo = await this.repoRepository.findOne({
      where: { gitUrl: repoUrl, branch },
    });

    if (!repo) {
      throw new NotFoundException(
        `No registered repository found for ${repoUrl} on branch ${branch}`,
      );
    }

    await this.repoRepository.update(repo.id, {
      status: RepositoryStatus.CLONING,
    });

    await this.cloneQueue.add("clone", {
      repositoryId: repo.id,
      serviceId: repo.serviceId,
    });

    this.logger.log(
      `Ingestion triggered for repository ${repo.name} (${repo.id})`,
    );

    return { repositoryId: repo.id };
  }
}

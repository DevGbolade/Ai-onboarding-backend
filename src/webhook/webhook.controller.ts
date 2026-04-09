import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

interface GithubPushPayload {
  ref: string;
  repository: {
    clone_url: string;
    default_branch: string;
  };
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('github')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive a GitHub push webhook and trigger ingestion' })
  async handleGithubPush(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ message: string; repositoryId: string }> {
    const rawBody = req.rawBody;

    if (!rawBody || !signature) {
      throw new BadRequestException('Missing signature or body');
    }

    const isValid = this.webhookService.verifySignature(rawBody, signature);
    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString()) as GithubPushPayload;
    const ref = payload.ref;
    const repoUrl = payload.repository.clone_url;

    // ref is in the form refs/heads/<branch>
    const branch = ref.replace('refs/heads/', '');

    try {
      const { repositoryId } = await this.webhookService.handlePush(repoUrl, branch);
      return { message: 'Ingestion triggered', repositoryId };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error('Unexpected error handling push webhook', err);
      throw err;
    }
  }
}

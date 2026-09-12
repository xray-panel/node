import { createZodDto } from 'nestjs-zod';

import { ClearLogsCommand } from '@libs/contracts/commands';

export class ClearLogsResponseDto extends createZodDto(ClearLogsCommand.ResponseSchema) {}

import { z } from 'zod';

import { REST_API } from '../../api';

export namespace ClearLogsCommand {
    export const url = REST_API.XRAY.CLEAR_LOGS;

    export const ResponseSchema = z.object({
        response: z.object({
            directory: z.string(),
            rotated: z.boolean(),
            removedArchives: z.number(),
            bytesFreed: z.number(),
            truncatedCurrent: z.boolean(),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}

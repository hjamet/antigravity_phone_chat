import { z } from 'zod';

/**
 * Zod schemas for validating data extracted from the Agent Manager via CDP.
 * This guarantees that the front-end will only receive properly structured data,
 * and loudly warns if Deepmind UI changes break our extraction logic.
 */

export const userMessageSchema = z.object({
    role: z.literal('user'),
    type: z.literal('message'),
    content: z.string(),
    html: z.string().optional()
});

export const taskBlockSchema = z.object({
    role: z.literal('agent'),
    type: z.literal('taskBlock'),
    taskTitle: z.string().optional(),
    taskStatus: z.string().optional(),
    taskSummary: z.string(),
    allStatuses: z.array(z.string()).optional(),
    html: z.string().optional()
});

export const directMessageSchema = z.object({
    role: z.literal('agent'),
    type: z.literal('directMessage'),
    content: z.string(),
    html: z.string().optional()
});

// A message could be any of the three types
export const messageSchema = z.union([
    userMessageSchema,
    taskBlockSchema,
    directMessageSchema
]);

export const snapshotSchema = z.object({
    messages: z.array(messageSchema).optional(),
    isFull: z.boolean().optional(),
    isStreaming: z.boolean().optional(),
    availableArtifacts: z.array(z.string()).optional(),
    scrollInfo: z.any().optional()
});

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/guides' }),
    schema: z.object({
        title: z.string(),
    })
});

const updates = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/updates' }),
    schema: z.object({
        title: z.string(),
        version: z.string(),
        date: z.string(),
        tag: z.string(),
        summary: z.string(),
    })
});

export const collections = { guides, updates };
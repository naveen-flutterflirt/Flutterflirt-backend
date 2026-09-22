const { z } = require('zod');

const createBlogSchema = z.object({
  title: z.string().min(3, "Title is required"),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  featured: z.boolean().optional().default(false),
  status: z.enum(['draft', 'published']).optional().default('draft'),
  cover_image: z.string().url().optional().or(z.literal('')),
  image: z.string().url().optional().or(z.literal('')),
  sections: z.array(z.any()).optional()
});

module.exports = {
  createBlogSchema
};

require('dotenv').config();
const { pool } = require('../src/config/db');
const { generateSectionSlugs, generateUniqueBlogSlug } = require('../src/utils/slugify');
const { blogCache } = require('../src/utils/cache');

const sampleBlogs = [
  {
    title: 'How to Learn React in 2026',
    excerpt: 'A complete guide to mastering React, Server Components, and modern state architecture.',
    cover_image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=1200&auto=format&fit=crop',
    category: 'Frontend',
    author: 'Alex Rivera',
    featured: true,
    status: 'published',
    sections: [
      {
        heading: 'What is React?',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'React is a declarative, efficient, and flexible JavaScript library for building interactive user interfaces. It lets you compose complex UIs from small and isolated pieces of code called ',
                },
                {
                  type: 'text',
                  marks: [{ type: 'bold' }],
                  text: 'components',
                },
                {
                  type: 'text',
                  text: '.',
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Since its introduction by Meta, React has evolved from client-side DOM diffing into a full-stack UI paradigm powering modern web development globally.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Why Learn React in 2026?',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'React continues to dominate the frontend ecosystem with unmatched job opportunities, robust tooling like Next.js and Vite, and seamless integration with TypeScript.',
                },
              ],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          marks: [{ type: 'bold' }],
                          text: 'Server Components & Actions: ',
                        },
                        {
                          type: 'text',
                          text: 'Zero-bundle-size server rendering for instant page speeds.',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          marks: [{ type: 'bold' }],
                          text: 'Vibrant Ecosystem: ',
                        },
                        {
                          type: 'text',
                          text: 'Massive library support from UI primitives to data fetching.',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          marks: [{ type: 'bold' }],
                          text: 'Cross-Platform Skills: ',
                        },
                        {
                          type: 'text',
                          text: 'React Native powers iOS, Android, and desktop apps.',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Setting Up Your Environment',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Getting started in 2026 is faster than ever. We recommend creating your project with Next.js or Vite for maximum developer velocity:',
                },
              ],
            },
            {
              type: 'codeBlock',
              attrs: { language: 'bash' },
              content: [
                {
                  type: 'text',
                  text: 'npx create-next-app@latest my-app --typescript --tailwind\ncd my-app\nnpm run dev',
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This generates a ready-to-code workspace with TypeScript, Tailwind CSS, and App Router pre-configured.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Core Concepts: Components & State',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'React components are pure functions that accept props and return JSX elements. State is managed via hooks like ',
                },
                {
                  type: 'text',
                  marks: [{ type: 'code' }],
                  text: 'useState',
                },
                {
                  type: 'text',
                  text: ' and ',
                },
                {
                  type: 'text',
                  marks: [{ type: 'code' }],
                  text: 'useReducer',
                },
                {
                  type: 'text',
                  text: ':',
                },
              ],
            },
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'italic' }],
                      text: '"Always think of UI as a direct projection of your application state over time."',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    title: 'Flutter vs React Native: The Cross-Platform Battle in 2026',
    excerpt: 'An in-depth architectural comparison between Flutter and React Native for modern mobile development.',
    cover_image: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?q=80&w=1200&auto=format&fit=crop',
    category: 'Mobile Dev',
    author: 'Elena Rostova',
    featured: false,
    status: 'published',
    sections: [
      {
        heading: 'Introduction to Modern Mobile Frameworks',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Building separate native applications for iOS and Android is expensive and slows time-to-market. Both Flutter and React Native offer true cross-platform capabilities with near-native performance.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Performance: Skia/Impeller vs React Native Fabric',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Flutter renders every pixel using its custom graphics engine (Impeller/Skia), giving pixel-perfect consistency across devices. React Native with the New Architecture (Fabric + TurboModules) utilizes direct C++ JSI bindings for lightning-fast native communication.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Which One Should Your Startup Pick?',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'If your team already excels in React and TypeScript, React Native is the natural choice. If you require custom vector graphics, high-framerate animations, or uniform branding across desktop and mobile, Flutter is unmatched.',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    title: 'Testing Tiptap Sections and Slugs',
    excerpt: 'Demonstrating duplicate section slug generation, reordering, and rich text Tiptap JSON blocks.',
    cover_image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop',
    category: 'Architecture',
    author: 'Jordan Vance',
    featured: false,
    status: 'published',
    sections: [
      {
        heading: 'Introduction One',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This article demonstrates how multiple sections with similar or duplicate headings are uniquely identified with stable slugs like ',
                },
                {
                  type: 'text',
                  marks: [{ type: 'code' }],
                  text: '#introduction-one',
                },
                {
                  type: 'text',
                  text: ' without collisions.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Introduction Two Updated',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Second section with rich content stored directly as PostgreSQL JSONB. The frontend easily maps this to dynamic Table of Contents navigation.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Brand New Section Added',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Every section has an ordered position and can be reordered at any time seamlessly.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Getting Started 🚀',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Clean slug generated from emoji headings: ',
                },
                {
                  type: 'text',
                  marks: [{ type: 'bold' }],
                  text: '#getting-started',
                },
                {
                  type: 'text',
                  text: '.',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    title: 'Mastering Agentic Workflows in 2026',
    excerpt: 'How multi-agent pairs collaborate on backend and frontend systems with explicit contracts.',
    cover_image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1200&auto=format&fit=crop',
    category: 'AI Engineering',
    author: 'Antigravity Pair',
    featured: false,
    status: 'published',
    sections: [
      {
        heading: 'Why Explicit Contracts Matter',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'When autonomous coding agents collaborate on the same system, having an explicit architectural contract is essential to prevent conflicting assumptions.',
                },
              ],
            },
          ],
        },
      },
      {
        heading: 'Tiptap JSON as Source of Truth',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Storing rich content directly as PostgreSQL JSONB preserves complete semantic structure without brittle HTML parsing.',
                },
              ],
            },
          ],
        },
      },
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Starting seed process with complete blogs...');
    await client.query('BEGIN');

    // Clean existing blogs
    await client.query('DELETE FROM blogs');

    for (const blogData of sampleBlogs) {
      const blogSlug = await generateUniqueBlogSlug(blogData.title, client);
      
      const blogInsertRes = await client.query(`
        INSERT INTO blogs (title, slug, excerpt, cover_image, category, author, featured, status, published_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
        RETURNING id
      `, [
        blogData.title,
        blogSlug,
        blogData.excerpt,
        blogData.cover_image,
        blogData.category,
        blogData.author,
        blogData.featured,
        blogData.status,
      ]);

      const blogId = blogInsertRes.rows[0].id;
      const sectionsWithSlugs = generateSectionSlugs(blogData.sections);

      for (let i = 0; i < sectionsWithSlugs.length; i++) {
        const sec = sectionsWithSlugs[i];
        await client.query(`
          INSERT INTO blog_sections (blog_id, heading, slug, content, position, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `, [
          blogId,
          sec.heading,
          sec.slug,
          JSON.stringify(sec.content),
          i + 1,
        ]);
      }

      console.log(`Seeded blog: "${blogData.title}" (${sectionsWithSlugs.length} sections)`);
    }

    await client.query('COMMIT');
    blogCache.clear();
    console.log('Database seeded successfully with all sample & test-api blogs!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

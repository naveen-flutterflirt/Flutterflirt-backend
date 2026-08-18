const slugifyLib = require('slugify');

/**
 * Cleanly slugify a string: lowercase, strict alphanumeric with hyphens, no emojis
 */
function slugifyText(text) {
  if (!text || typeof text !== 'string') return 'section';
  const clean = slugifyLib(text, {
    lower: true,
    strict: true,
    trim: true,
    remove: /[*+~.()'"!:@]/g,
  });
  return clean || 'section';
}

/**
 * Generate unique slugs for an array of sections within a blog
 * Handles duplicates: ["Introduction", "Introduction", "Introduction"]
 * -> ["introduction", "introduction-2", "introduction-3"]
 */
function generateSectionSlugs(sections = []) {
  const seenCounts = new Map();
  
  return sections.map((sec) => {
    const rawHeading = (sec.heading || 'section').trim();
    const baseSlug = slugifyText(rawHeading);
    
    const count = (seenCounts.get(baseSlug) || 0) + 1;
    seenCounts.set(baseSlug, count);
    
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;
    return {
      ...sec,
      slug,
    };
  });
}

/**
 * Generate a unique blog slug from title by checking against DB
 */
async function generateUniqueBlogSlug(title, client, currentBlogId = null) {
  const baseSlug = slugifyText(title);
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    let queryText = 'SELECT id FROM blogs WHERE slug = $1';
    const queryParams = [slug];

    if (currentBlogId) {
      queryText += ' AND id != $2';
      queryParams.push(currentBlogId);
    }

    const res = await client.query(queryText, queryParams);
    if (res.rows.length === 0) {
      return slug;
    }
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

module.exports = {
  slugifyText,
  generateSectionSlugs,
  generateUniqueBlogSlug,
};

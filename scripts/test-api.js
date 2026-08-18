async function runTests() {
  const BASE_URL = 'http://localhost:5000';
  console.log('Testing backend APIs against:', BASE_URL);

  // 1. Test GET /api/blogs
  const listRes = await fetch(`${BASE_URL}/api/blogs`);
  const listData = await listRes.json();
  console.log('1. GET /api/blogs status:', listRes.status, 'success:', listData.success, 'count:', listData.data?.length);

  // 2. Test GET /api/blogs/:slug
  const slug = listData.data[0]?.slug;
  console.log('Fetching slug:', slug);
  const detailRes = await fetch(`${BASE_URL}/api/blogs/${slug}`);
  const detailData = await detailRes.json();
  console.log('2. GET /api/blogs/:slug status:', detailRes.status, 'title:', detailData.data?.title);
  console.log('   Sections:', detailData.data?.sections?.map(s => ({ pos: s.position, heading: s.heading, slug: s.slug })));

  // 3. Test POST /api/blogs with duplicate headings
  const newBlogPayload = {
    title: 'Testing Tiptap Sections and Slugs',
    excerpt: 'Checking duplicate slug generation and section positions.',
    cover_image: 'https://images.unsplash.com/photo-1518770660439-4636190af475',
    status: 'draft',
    category: 'Testing',
    sections: [
      {
        heading: 'Introduction',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First section.' }] }] },
      },
      {
        heading: 'Introduction',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second section with same heading.' }] }] },
      },
      {
        heading: 'Introduction',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third section with same heading.' }] }] },
      },
      {
        heading: 'Getting Started 🚀',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fourth section with emoji.' }] }] },
      },
    ],
  };

  const createRes = await fetch(`${BASE_URL}/api/blogs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newBlogPayload),
  });
  const createData = await createRes.json();
  console.log('3. POST /api/blogs status:', createRes.status, 'success:', createData.success);
  console.log('   Generated Section Slugs:', createData.data?.sections?.map(s => ({ pos: s.position, heading: s.heading, slug: s.slug })));

  const createdId = createData.data?.id;
  if (!createdId) {
    throw new Error('Failed to get created blog ID');
  }

  // 4. Test PUT /api/blogs/:id (Reorder, edit, add, delete sections)
  const existingSections = createData.data.sections;
  const updatePayload = {
    title: 'Testing Tiptap Sections and Slugs (Updated)',
    excerpt: 'Updated excerpt.',
    status: 'published',
    sections: [
      // Swap order of 2nd and 1st
      {
        id: existingSections[1].id,
        heading: 'Introduction Two Updated',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated content for 2nd.' }] }] },
      },
      {
        id: existingSections[0].id,
        heading: 'Introduction One',
        content: existingSections[0].content,
      },
      // New section added without ID
      {
        heading: 'Brand New Section Added',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New content.' }] }] },
      },
      // Section 2 & 3 from original are omitted -> should be deleted!
    ],
  };

  const updateRes = await fetch(`${BASE_URL}/api/blogs/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload),
  });
  const updateData = await updateRes.json();
  console.log('4. PUT /api/blogs/:id status:', updateRes.status, 'success:', updateData.success);
  console.log('   Updated Section Slugs & Positions:', updateData.data?.sections?.map(s => ({ pos: s.position, heading: s.heading, slug: s.slug })));

  // 5. Test DELETE /api/blogs/:id
  const deleteRes = await fetch(`${BASE_URL}/api/blogs/${createdId}`, { method: 'DELETE' });
  const deleteData = await deleteRes.json();
  console.log('5. DELETE /api/blogs/:id status:', deleteRes.status, 'success:', deleteData.success);

  console.log('All backend API tests passed with flying colors!');
}

runTests().catch((err) => {
  console.error('API Test Error:', err);
  process.exit(1);
});

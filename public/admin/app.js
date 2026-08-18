const state = {
  token: localStorage.getItem('flutterflirt_admin_token') || '',
  activeTab: 'blogs',
  blogs: [],
  contactQueries: [],
  editingId: null,
  formSections: [],
};

const app = document.getElementById('app');

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

function renderLogin() {
  app.innerHTML = `
    <div class="container">
      <div class="card" id="loginForm">
        <h2>Admin Login</h2>
        <form id="loginFormEl">
          <div class="form-grid">
            <label>
              Email
              <input name="email" type="email" required placeholder="admin@flutterflirt.com" />
            </label>
            <label>
              Password
              <input name="password" type="password" required placeholder="Enter password" />
            </label>
          </div>
          <div class="form-actions">
            <button type="submit">Login</button>
          </div>
          <div id="errorBox"></div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('loginFormEl').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = { email: formData.get('email'), password: formData.get('password') };

    try {
      const result = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      state.token = result.token;
      localStorage.setItem('flutterflirt_admin_token', result.token);
      renderDashboard();
    } catch (error) {
      document.getElementById('errorBox').textContent = error.message;
    }
  });
}

function slugifyPreview(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function renderBlogForm() {
  const blog = state.blogs.find((item) => item.id === state.editingId) || {
    title: '',
    excerpt: '',
    cover_image: '',
    category: 'Marketing',
    author: 'FlutterFlirt Team',
    featured: false,
    status: 'draft',
    sections: [
      {
        heading: 'Introduction',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Section content here...' }] }] },
      },
    ],
  };

  if (!state.formSections || state.formSections.length === 0) {
    state.formSections = blog.sections && blog.sections.length > 0 
      ? JSON.parse(JSON.stringify(blog.sections))
      : [{ heading: 'Introduction', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] } }];
  }

  return `
    <div class="card">
      <h3>${state.editingId ? 'Edit Blog Post' : 'Create New Blog Post'}</h3>
      <form id="blogForm">
        <input type="hidden" name="id" value="${state.editingId || ''}" />
        <div class="form-grid">
          <label>
            Title
            <input name="title" required value="${escapeHtml(blog.title || '')}" placeholder="How to Learn React" />
          </label>
          <label>
            Category
            <input name="category" value="${escapeHtml(blog.category || '')}" placeholder="Technology" />
          </label>
          <label>
            Author
            <input name="author" value="${escapeHtml(blog.author || '')}" />
          </label>
          <label>
            Cover Image URL
            <input name="cover_image" value="${escapeHtml(blog.cover_image || blog.image || '')}" placeholder="https://images.unsplash.com/..." />
          </label>
          <label>
            Featured
            <select name="featured">
              <option value="false" ${blog.featured ? '' : 'selected'}>No</option>
              <option value="true" ${blog.featured ? 'selected' : ''}>Yes</option>
            </select>
          </label>
          <label>
            Status
            <select name="status">
              <option value="draft" ${blog.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="published" ${blog.status === 'published' ? 'selected' : ''}>Published</option>
            </select>
          </label>
        </div>
        <div style="margin-top: 16px;">
          <label>
            Excerpt
            <textarea name="excerpt" placeholder="Short preview of the article...">${escapeHtml(blog.excerpt || '')}</textarea>
          </label>
        </div>

        <div style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="margin: 0;">Ordered Sections (Tiptap JSON / Heading)</h4>
            <button type="button" class="secondary" id="addSectionBtn">+ Add Section</button>
          </div>

          <div id="sectionsContainer">
            ${state.formSections.map((sec, idx) => {
              const textContent = typeof sec.content === 'string'
                ? sec.content
                : (sec.content?.content?.[0]?.content?.[0]?.text || JSON.stringify(sec.content || {}));
              const previewSlug = sec.slug || slugifyPreview(sec.heading);
              return `
                <div class="card section-card" data-idx="${idx}" style="background: #f9fafb; margin-bottom: 16px; border: 1px solid #e5e7eb;">
                  <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>Section ${idx + 1}</strong>
                    <div class="row">
                      ${idx > 0 ? `<button type="button" class="secondary move-up-btn" data-idx="${idx}" style="padding: 4px 8px; font-size: 12px;">↑</button>` : ''}
                      ${idx < state.formSections.length - 1 ? `<button type="button" class="secondary move-down-btn" data-idx="${idx}" style="padding: 4px 8px; font-size: 12px;">↓</button>` : ''}
                      <button type="button" class="danger remove-sec-btn" data-idx="${idx}" style="padding: 4px 8px; font-size: 12px;">Remove</button>
                    </div>
                  </div>
                  <div class="form-grid">
                    <label>
                      Heading
                      <input class="sec-heading-input" data-idx="${idx}" value="${escapeHtml(sec.heading || '')}" required placeholder="What is React?" />
                    </label>
                    <label>
                      Sidebar ID (Read-only anchor)
                      <input value="#${escapeHtml(previewSlug)}" readonly style="background: #e5e7eb; color: #4b5563;" />
                    </label>
                  </div>
                  <div style="margin-top: 12px;">
                    <label>
                      Content (Text or Tiptap JSON)
                      <textarea class="sec-content-input" data-idx="${idx}" placeholder="Enter section body text...">${escapeHtml(textContent)}</textarea>
                    </label>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="form-actions row">
          <button type="submit">${state.editingId ? 'Update Blog' : 'Create Blog'}</button>
          <button type="button" class="secondary" id="cancelEditBtn">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderDashboard() {
  app.innerHTML = `
    <header>
      <div class="container">
        <h2>FlutterFlirt Admin</h2>
        <button class="secondary" id="logoutBtn">Logout</button>
      </div>
    </header>
    <div class="container">
      <div class="tabs">
        <button class="tab-button ${state.activeTab === 'blogs' ? 'active' : ''}" data-tab="blogs">Blogs</button>
        <button class="tab-button ${state.activeTab === 'queries' ? 'active' : ''}" data-tab="queries">Contact Queries</button>
      </div>
      ${state.activeTab === 'blogs' ? renderBlogSection() : renderQueriesSection()}
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    state.token = '';
    localStorage.removeItem('flutterflirt_admin_token');
    renderLogin();
  });

  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      renderDashboard();
    });
  });

  attachBlogFormHandlers();
  attachTableHandlers();
}

function attachBlogFormHandlers() {
  const blogFormContainer = document.getElementById('blogFormContainer');
  if (!blogFormContainer) return;

  blogFormContainer.innerHTML = renderBlogForm();
  
  const form = document.getElementById('blogForm');
  if (form) form.addEventListener('submit', handleBlogSubmit);
  
  document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    state.editingId = null;
    state.formSections = [];
    renderDashboard();
  });

  document.getElementById('addSectionBtn')?.addEventListener('click', () => {
    saveCurrentFormInputs();
    state.formSections.push({
      heading: `Section ${state.formSections.length + 1}`,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
    });
    attachBlogFormHandlers();
  });

  document.querySelectorAll('.remove-sec-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveCurrentFormInputs();
      const idx = Number(btn.dataset.idx);
      state.formSections.splice(idx, 1);
      if (state.formSections.length === 0) {
        state.formSections.push({ heading: 'Introduction', content: '' });
      }
      attachBlogFormHandlers();
    });
  });

  document.querySelectorAll('.move-up-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveCurrentFormInputs();
      const idx = Number(btn.dataset.idx);
      if (idx > 0) {
        const temp = state.formSections[idx];
        state.formSections[idx] = state.formSections[idx - 1];
        state.formSections[idx - 1] = temp;
        attachBlogFormHandlers();
      }
    });
  });

  document.querySelectorAll('.move-down-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveCurrentFormInputs();
      const idx = Number(btn.dataset.idx);
      if (idx < state.formSections.length - 1) {
        const temp = state.formSections[idx];
        state.formSections[idx] = state.formSections[idx + 1];
        state.formSections[idx + 1] = temp;
        attachBlogFormHandlers();
      }
    });
  });
}

function saveCurrentFormInputs() {
  document.querySelectorAll('.sec-heading-input').forEach((input) => {
    const idx = Number(input.dataset.idx);
    if (state.formSections[idx]) {
      state.formSections[idx].heading = input.value;
    }
  });
  document.querySelectorAll('.sec-content-input').forEach((textarea) => {
    const idx = Number(textarea.dataset.idx);
    if (state.formSections[idx]) {
      const val = textarea.value;
      try {
        state.formSections[idx].content = JSON.parse(val);
      } catch {
        state.formSections[idx].content = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: val }] }],
        };
      }
    }
  });
}

function attachTableHandlers() {
  document.getElementById('addBlogBtn')?.addEventListener('click', () => {
    state.editingId = null;
    state.formSections = [{ heading: 'Introduction', content: '' }];
    renderDashboard();
  });

  document.querySelectorAll('[data-action="delete-blog"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!confirm('Delete this blog post?')) return;
      try {
        await apiFetch(`/api/blogs/${id}`, { method: 'DELETE' });
        await loadDashboardData();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-action="edit-blog"]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      state.editingId = id;
      const found = state.blogs.find((b) => b.id === id);
      state.formSections = found?.sections ? JSON.parse(JSON.stringify(found.sections)) : [];
      renderDashboard();
    });
  });

  document.querySelectorAll('[data-action="status-update"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const status = button.dataset.status;
      try {
        await apiFetch(`/api/admin/contact-queries/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        await loadDashboardData();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderBlogSection() {
  return `
    <div class="row" style="margin-bottom: 16px;">
      <button id="addBlogBtn">Add New Blog</button>
    </div>
    <div id="blogFormContainer"></div>
    <div class="card" style="margin-top: 20px;">
      <h3>Published & Draft Blogs</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Sections</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.blogs.length ? state.blogs.map(blog => `
              <tr>
                <td><strong>${escapeHtml(blog.title)}</strong><br/><small style="color: #6b7280;">/blog/${escapeHtml(blog.slug)}</small></td>
                <td>${escapeHtml(blog.category || 'General')}</td>
                <td><span class="status-pill ${blog.status === 'published' ? 'status-closed' : 'status-pending'}">${escapeHtml(blog.status)}</span></td>
                <td>${blog.sections ? blog.sections.length : 0} sections</td>
                <td class="row">
                  <a href="/blog/${escapeHtml(blog.slug)}" target="_blank" style="font-size: 13px; color: #2563eb; text-decoration: none; margin-right: 8px;">View</a>
                  <button class="secondary" data-action="edit-blog" data-id="${blog.id}">Edit</button>
                  <button class="danger" data-action="delete-blog" data-id="${blog.id}">Delete</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="5">No blogs found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderQueriesSection() {
  return `
    <div class="card">
      <h3>Contact Queries</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Status</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            ${state.contactQueries.length ? state.contactQueries.map(query => `
              <tr>
                <td>${escapeHtml(query.name)}</td>
                <td>${escapeHtml(query.email)}</td>
                <td>${escapeHtml(query.companyName || '-')}</td>
                <td><span class="status-pill status-${query.status}">${escapeHtml(query.status)}</span></td>
                <td class="row">
                  <button class="success" data-action="status-update" data-id="${query.id}" data-status="replied">Replied</button>
                  <button class="secondary" data-action="status-update" data-id="${query.id}" data-status="closed">Closed</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="5">No queries found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function handleBlogSubmit(event) {
  event.preventDefault();
  saveCurrentFormInputs();

  const form = event.target;
  const formData = new FormData(form);

  const payload = {
    title: formData.get('title'),
    excerpt: formData.get('excerpt'),
    cover_image: formData.get('cover_image'),
    category: formData.get('category'),
    author: formData.get('author'),
    featured: formData.get('featured') === 'true',
    status: formData.get('status'),
    sections: state.formSections.map((sec) => ({
      id: sec.id,
      heading: sec.heading,
      content: sec.content,
    })),
  };

  try {
    if (state.editingId) {
      await apiFetch(`/api/blogs/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/api/blogs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    state.editingId = null;
    state.formSections = [];
    await loadDashboardData();
  } catch (error) {
    alert(error.message);
  }
}

async function loadDashboardData() {
  try {
    const [blogs, queries] = await Promise.all([
      apiFetch('/api/admin/blogs').catch(() => apiFetch('/api/blogs')),
      apiFetch('/api/admin/contact-queries').catch(() => []),
    ]);
    state.blogs = blogs.data || blogs.blogs || blogs || [];
    state.contactQueries = queries.contactQueries || queries || [];
    renderDashboard();
  } catch (error) {
    console.error(error);
    renderLogin();
  }
}

async function initialize() {
  if (!state.token) {
    renderLogin();
    return;
  }
  await loadDashboardData();
}

initialize();

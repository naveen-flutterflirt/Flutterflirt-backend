const state = {
  token: localStorage.getItem('flutterflirt_admin_token') || '',
  activeTab: 'blogs',
  blogs: [],
  contactQueries: [],
  editingId: null,
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

function renderBlogForm() {
  const blog = state.blogs.find((item) => item.id === state.editingId) || {
    title: '',
    excerpt: '',
    content: '',
    category: 'Marketing',
    image: '',
    author: 'FlutterFlirt Team',
    featured: false,
    status: 'draft',
  };

  return `
    <div class="card">
      <h3>${state.editingId ? 'Edit Blog' : 'Add New Blog'}</h3>
      <form id="blogForm">
        <input type="hidden" name="id" value="${state.editingId || ''}" />
        <div class="form-grid">
          <label>
            Title
            <input name="title" required value="${escapeHtml(blog.title || '')}" />
          </label>
          <label>
            Category
            <input name="category" value="${escapeHtml(blog.category || '')}" />
          </label>
          <label>
            Author
            <input name="author" value="${escapeHtml(blog.author || '')}" />
          </label>
          <label>
            Image URL
            <input name="image" value="${escapeHtml(blog.image || '')}" />
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
        <div class="form-grid" style="margin-top: 16px;">
          <label>
            Excerpt
            <textarea name="excerpt">${escapeHtml(blog.excerpt || '')}</textarea>
          </label>
          <label>
            Content
            <textarea name="content" required>${escapeHtml(blog.content || '')}</textarea>
          </label>
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

  const blogFormContainer = document.getElementById('blogFormContainer');
  if (blogFormContainer) {
    blogFormContainer.innerHTML = renderBlogForm();
    document.getElementById('blogForm').addEventListener('submit', handleBlogSubmit);
    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
      state.editingId = null;
      renderDashboard();
    });
  }

  const addBlogBtn = document.getElementById('addBlogBtn');
  addBlogBtn?.addEventListener('click', () => {
    state.editingId = null;
    renderDashboard();
  });

  document.querySelectorAll('[data-action="delete-blog"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = Number(button.dataset.id);
      if (!confirm('Delete this blog?')) return;
      try {
        await apiFetch(`/api/admin/blogs/${id}`, { method: 'DELETE' });
        await loadDashboardData();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-action="edit-blog"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editingId = Number(button.dataset.id);
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
      <button id="addBlogBtn">Add Blog</button>
    </div>
    <div id="blogFormContainer"></div>
    <div class="card" style="margin-top: 20px;">
      <h3>Blog List</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Featured</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.blogs.length ? state.blogs.map(blog => `
              <tr>
                <td>${escapeHtml(blog.title)}</td>
                <td>${escapeHtml(blog.category || 'General')}</td>
                <td>${escapeHtml(blog.status)}</td>
                <td>${blog.featured ? 'Yes' : 'No'}</td>
                <td class="row">
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
  const form = event.target;
  const formData = new FormData(form);
  const payload = {
    title: formData.get('title'),
    excerpt: formData.get('excerpt'),
    content: formData.get('content'),
    category: formData.get('category'),
    image: formData.get('image'),
    author: formData.get('author'),
    featured: formData.get('featured') === 'true',
    status: formData.get('status'),
  };

  try {
    if (state.editingId) {
      await apiFetch(`/api/admin/blogs/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/api/admin/blogs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    state.editingId = null;
    await loadDashboardData();
  } catch (error) {
    alert(error.message);
  }
}

async function loadDashboardData() {
  try {
    const [blogs, queries] = await Promise.all([
      apiFetch('/api/admin/blogs'),
      apiFetch('/api/admin/contact-queries'),
    ]);
    state.blogs = blogs.blogs || blogs || [];
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

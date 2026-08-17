# FlutterFlirt Backend Build Prompt

Build a separate Express.js backend project in this directory for the FlutterFlirt website. This backend will be hosted separately from the Next.js frontend and should not depend on the frontend app code.

## Objective

Create a clean Express backend with:

- public blog listing and blog detail APIs
- protected admin authentication
- complete blog CRUD for admin
- contact form query management
- an admin dashboard UI served from the same app

## Project Requirements

### Stack

- Node.js
- Express.js
- postgres with neonDB
- JWT auth
- CORS
- dotenv

### Directory Structure

Create these files/folders:

- package.json
- .env.example
- .gitignore
- src/server.js
- src/app.js
- src/config/db.js
- src/middleware/auth.js
- src/models/Blog.js
- src/models/ContactQuery.js
- src/controllers/blogController.js
- src/controllers/contactController.js
- src/controllers/adminController.js
- src/routes/blogRoutes.js
- src/routes/contactRoutes.js
- src/routes/adminRoutes.js
- public/admin/index.html
- public/admin/styles.css
- public/admin/app.js

### Public API

Implement:

- GET /api/health
- GET /api/blogs
- GET /api/blogs/:slug
- POST /api/contact

### Admin API

Implement:

- POST /api/admin/login
- GET /api/admin/blogs
- POST /api/admin/blogs
- PUT /api/admin/blogs/:id
- DELETE /api/admin/blogs/:id
- GET /api/admin/contact-queries
- GET /api/admin/contact-queries/:id
- PATCH /api/admin/contact-queries/:id/status

### Blog Schema

Each blog should have:

- title
- slug
- excerpt
- content
- category
- image
- featured
- publishedAt
- author
- status

Slug should auto-generate from the title and be unique.

### Contact Query Schema

Each contact query should have:

- name
- email
- phone
- companyName
- message
- status
- createdAt

Default status should be pending.

### Admin Auth

- Read ADMIN_EMAIL and ADMIN_PASSWORD from environment
- Add JWT login flow using JWT_SECRET
- Protect admin routes using Authorization: Bearer <token>
- Return 401 if token is missing or invalid

### Admin Dashboard UI

Serve a basic admin dashboard at /admin with:

- login form
- blog list table
- create/edit/delete blog actions
- contact submissions list
- ability to change query status to pending, replied, or closed

Use fetch() to call the backend API. Keep the UI simple but functional.

### CORS and Config

- Use CORS with CLIENT_URL from .env
- Add PORT and MONGO_URI to env
- Use .env.example with sensible defaults

### Validation

- title and content required for blog creation
- name, email, and message required for contact submission
- Return consistent JSON error responses
- Use standard HTTP status codes

### Security

- Never expose admin credentials in public frontend code
- Never allow unauthenticated users to create, edit, or delete blogs
- Do not expose admin routes to unauthenticated users

### Acceptance

The final result should:

- run in its own directory with npm install and npm run dev
- allow admin login
- allow creation, editing, and deletion of blogs
- allow contact form submissions to be saved and viewed in admin
- provide a working /admin dashboard
- keep backend separate from the Next.js app

## Important Notes

- Do not edit the frontend app unless absolutely needed for integration in the future.
- Focus on a backend-first implementation that is ready for future frontend connection.
- Keep code clean, organized, and production-ready.
- If MongoDB is unavailable, still implement the schema and backend structure correctly and document required environment variables.

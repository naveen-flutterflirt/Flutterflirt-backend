# FlutterFlirt Backend Agent Instructions

Build the backend as a separate Express project in this directory. Do not modify the Next.js frontend project. Keep the frontend and backend completely separate and host them on different domains or ports.

## Goal

Create a production-ready backend for the FlutterFlirt marketing website that supports:

1. Blog posts for public pages
2. Admin authentication and dashboard
3. Blog CRUD management from admin panel
4. Contact form query storage and admin visibility
5. A simple admin UI served from the same backend

## Tech Stack

- Node.js
- Express.js
- postgres with neonD
- JWT authentication
- CORS
- dotenv

## Project Structure

Use the following structure:

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

## Functional Requirements

### Blog APIs

Create these endpoints:

- GET /api/health
- GET /api/blogs
- GET /api/blogs/:slug

For admin use:

- POST /api/admin/login
- GET /api/admin/blogs
- POST /api/admin/blogs
- PUT /api/admin/blogs/:id
- DELETE /api/admin/blogs/:id

### Contact APIs

- POST /api/contact
- GET /api/admin/contact-queries
- GET /api/admin/contact-queries/:id
- PATCH /api/admin/contact-queries/:id/status

### Admin Authentication

- Use JWT with a secret from env
- Admin credentials should be read from environment variables: ADMIN_EMAIL and ADMIN_PASSWORD
- Protect all admin routes with a middleware that checks Authorization: Bearer <token>
- If the token is missing or invalid, return 401

### Blog Fields

Each blog should include:

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

The slug should be auto-generated from the title, and should be unique.

### Contact Form Fields

Each query should include:

- name
- email
- phone
- companyName
- message
- status (default: pending)
- createdAt

### Admin Panel UI

Serve a simple dashboard at /admin. It should:

- show login form if no token is present
- allow admin login by email/password
- list all blogs in a table/grid
- support add blog, edit blog, and delete blog
- list all contact form submissions
- allow marking queries as pending, replied, or closed

Use fetch to talk to the API. Keep the page lightweight and simple.

### Frontend Integration

The next frontend website should later call:

- GET /api/blogs to show blog cards
- GET /api/blogs/:slug to render the full blog page
- POST /api/contact from the contact form

Keep the response structure clean and predictable.

## Validation Rules

- Blog title and content are required
- Contact name, email, and message are required
- Return consistent JSON error responses
- Use HTTP status codes: 200, 201, 400, 401, 404, 500

## Security Rules

- Never expose admin credentials in public code
- Never allow unauthenticated users to write or delete blogs
- Use CORS with allowed origins from CLIENT_URL
- Make sure only admin routes are protected

## Acceptance Criteria

- The backend runs from its own directory with npm install and npm run dev
- Admin can log in and manage blogs
- Public can read blogs
- Contact form submissions are stored and visible in admin panel
- Admin panel loads at /admin
- The project remains separate from the Next.js app

## Notes

If MongoDB is not available during setup, create the project with the Mongoose layer ready and document the env var needed. The admin panel and routes must still be implemented cleanly.

The coding agent should create production-quality code, not placeholder-only responses.

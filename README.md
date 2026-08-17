# FlutterFlirt Backend

This is the separate Express backend for the FlutterFlirt website. It handles:

- public blog listing and blog detail endpoints
- private admin CRUD for blogs
- contact form submissions management
- simple admin dashboard UI served from the same app

## Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- JWT for admin auth
- Static admin dashboard served under /admin

## Quick Start

1. Copy .env.example to .env
2. Update the values for your setup
3. Install dependencies:
   npm install
4. Start the server:
   npm run dev

## Main API Routes

Public

- GET /api/health
- GET /api/blogs
- GET /api/blogs/:slug
- POST /api/contact

Admin

- POST /api/admin/login
- GET /api/admin/blogs
- POST /api/admin/blogs
- PUT /api/admin/blogs/:id
- DELETE /api/admin/blogs/:id
- GET /api/admin/contact-queries
- PATCH /api/admin/contact-queries/:id/status

Admin UI

- http://localhost:5000/admin

## Environment Variables

- PORT
- MONGO_URI
- JWT_SECRET
- JWT_EXPIRES_IN
- CLIENT_URL
- ADMIN_EMAIL
- ADMIN_PASSWORD

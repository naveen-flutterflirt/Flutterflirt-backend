const { z } = require('zod');

const registerStudentSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters long"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 characters long").optional().or(z.literal('')),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

const loginStudentSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const adminLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const createCourseSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  level: z.string().optional(),
  duration: z.string().optional(),
});

module.exports = {
  registerStudentSchema,
  loginStudentSchema,
  adminLoginSchema,
  createCourseSchema
};

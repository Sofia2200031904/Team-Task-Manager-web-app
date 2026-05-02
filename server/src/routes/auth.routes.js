const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/user.model");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const HttpError = require("../utils/httpError");
const { signToken } = require("../utils/jwt");

const router = express.Router();

const signupSchema = z.object({
  name: z.string().min(2, "Name should be at least 2 characters"),
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(6, "Password should be at least 6 characters"),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(6, "Password should be at least 6 characters"),
});

router.post("/signup", validate({ body: signupSchema }), async (req, res) => {
  const { name, email, password, role } = req.body;

  const existingUser = await User.findOne({ email }).exec();
  if (existingUser) {
    throw new HttpError(409, "Email already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: role || "MEMBER",
  });

  const userPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };

  const token = signToken({ userId: user.id, role: user.role });
  return res.status(201).json({ token, user: userPayload });
});

router.post("/login", validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password").exec();
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signToken({ userId: user.id, role: user.role });
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id)
    .select("name email role createdAt")
    .exec();

  return res.json({ user });
});

module.exports = router;

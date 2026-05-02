const express = require("express");
const auth = require("../middlewares/auth");
const User = require("../models/user.model");

const router = express.Router();

router.get("/members", auth, async (req, res) => {
  const users = await User.find()
    .select("name email role createdAt")
    .sort({ createdAt: -1 })
    .exec();

  return res.json({ users });
});

module.exports = router;

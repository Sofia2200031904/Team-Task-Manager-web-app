const User = require("../models/user.model");
const HttpError = require("../utils/httpError");
const { verifyToken } = require("../utils/jwt");

const auth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new HttpError(401, "Authorization token missing");
    }

    const token = authorization.split(" ")[1];
    const payload = verifyToken(token);

    const user = await User.findById(payload.userId)
      .select("name email role")
      .exec();

    if (!user) {
      throw new HttpError(401, "Invalid token");
    }

    req.user = user.toJSON();
    next();
  } catch (error) {
    next(new HttpError(401, "Invalid or expired token"));
  }
};

module.exports = auth;

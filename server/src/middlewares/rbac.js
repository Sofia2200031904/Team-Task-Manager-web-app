const HttpError = require("../utils/httpError");

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }

  if (!roles.includes(req.user.role)) {
    return next(new HttpError(403, "You do not have permission to do this"));
  }

  return next();
};

module.exports = allowRoles;

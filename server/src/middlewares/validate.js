const HttpError = require("../utils/httpError");

const validate = (schemas) => (req, res, next) => {
  for (const [key, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[key]);

    if (!result.success) {
      const errorMessage = result.error.issues.map((issue) => issue.message).join(", ");
      return next(new HttpError(400, errorMessage || `Invalid ${key} payload`));
    }

    req[key] = result.data;
  }

  return next();
};

module.exports = validate;

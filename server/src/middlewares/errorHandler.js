const errorHandler = (err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Attachment is too large. Max allowed size is 10MB.",
    });
  }

  if (err?.code === 11000) {
    return res.status(409).json({
      message: "Duplicate value found for a unique field",
    });
  }

  if (err?.name === "CastError") {
    return res.status(400).json({
      message: "Invalid identifier provided",
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  return res.status(statusCode).json({ message });
};

module.exports = errorHandler;

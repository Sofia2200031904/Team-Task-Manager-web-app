const normalizeValue = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }

    const normalized = {};

    Object.entries(value).forEach(([key, innerValue]) => {
      if (key === "__v") {
        return;
      }

      normalized[key] = normalizeValue(innerValue);
    });

    if (Object.prototype.hasOwnProperty.call(normalized, "_id")) {
      normalized.id = String(normalized._id);
      delete normalized._id;
    }

    return normalized;
  }

  return value;
};

const schemaTransform = (_, ret) => normalizeValue(ret);

const buildSchemaOptions = (timestamps = true) => ({
  timestamps,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: schemaTransform,
  },
  toObject: {
    virtuals: true,
    versionKey: false,
    transform: schemaTransform,
  },
});

module.exports = {
  buildSchemaOptions,
};

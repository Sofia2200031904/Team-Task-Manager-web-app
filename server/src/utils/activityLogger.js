const ActivityLog = require("../models/activityLog.model");

const normalizeValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

const logTaskActivity = async ({
  projectId,
  taskId,
  actorId,
  action,
  message,
  fieldChanges = [],
}) => {
  await ActivityLog.create({
    projectId,
    taskId,
    actorId,
    action,
    message,
    fieldChanges: fieldChanges.map((item) => ({
      field: item.field,
      from: normalizeValue(item.from),
      to: normalizeValue(item.to),
    })),
  });
};

module.exports = {
  logTaskActivity,
};

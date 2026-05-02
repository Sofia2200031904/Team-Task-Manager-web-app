const STATUS_ORDER = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
};

const timestampOrMax = (value) => {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  return new Date(value).getTime();
};

const sortTasksForDisplay = (tasks) =>
  [...tasks].sort((a, b) => {
    const statusDiff =
      (STATUS_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER) -
      (STATUS_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER);

    if (statusDiff !== 0) {
      return statusDiff;
    }

    const dueDateDiff = timestampOrMax(a.dueDate) - timestampOrMax(b.dueDate);
    if (dueDateDiff !== 0) {
      return dueDateDiff;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

module.exports = {
  sortTasksForDisplay,
};

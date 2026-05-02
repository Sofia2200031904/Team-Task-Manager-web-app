const Task = require("../models/task.model");
const { isSmtpConfigured, sendEmail } = require("../utils/mailer");

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

const buildEmailContent = (name, tasks) => {
  const taskLines = tasks.map(
    (task) =>
      `- ${task.title} (${task.project.name}) | Due: ${formatDate(task.dueDate)}`
  );
  const text = [
    `Hi ${name},`,
    "",
    "You have overdue tasks that still need attention:",
    ...taskLines,
    "",
    "Please review and update them in Team Task Manager.",
  ].join("\n");

  const htmlListItems = tasks
    .map(
      (task) =>
        `<li><strong>${task.title}</strong> (${task.project.name}) - Due ${formatDate(task.dueDate)}</li>`
    )
    .join("");
  const html = [
    `<p>Hi ${name},</p>`,
    "<p>You have overdue tasks that still need attention:</p>",
    `<ul>${htmlListItems}</ul>`,
    "<p>Please review and update them in Team Task Manager.</p>",
  ].join("");

  return { text, html };
};

const notifyOverdueTasks = async () => {
  if (!isSmtpConfigured()) {
    return {
      skipped: true,
      reason: "SMTP configuration is missing",
      totalOverdueTasks: 0,
      notifiedUsers: 0,
      notifiedTasks: 0,
    };
  }

  const now = new Date();
  const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const overdueTasks = await Task.find({
    dueDate: { $lt: now },
    status: { $ne: "DONE" },
    $or: [{ overdueNotifiedAt: null }, { overdueNotifiedAt: { $lt: threshold } }],
  })
    .populate({ path: "assignee", select: "name email" })
    .populate({ path: "project", select: "name" })
    .exec();

  if (!overdueTasks.length) {
    return {
      skipped: false,
      reason: "No overdue tasks pending notification",
      totalOverdueTasks: 0,
      notifiedUsers: 0,
      notifiedTasks: 0,
    };
  }

  const tasksByEmail = new Map();
  overdueTasks.forEach((task) => {
    const email = task.assignee?.email;
    if (!email) {
      return;
    }

    const list = tasksByEmail.get(email) || [];
    list.push(task);
    tasksByEmail.set(email, list);
  });

  let notifiedUsers = 0;
  const notifiedTaskIds = new Set();

  for (const [email, tasks] of tasksByEmail.entries()) {
    const assigneeName = tasks[0]?.assignee?.name || "there";
    const { text, html } = buildEmailContent(assigneeName, tasks);
    await sendEmail({
      to: email,
      subject: "Overdue task reminder",
      text,
      html,
    });
    notifiedUsers += 1;
    tasks.forEach((task) => notifiedTaskIds.add(String(task.id)));
  }

  if (notifiedTaskIds.size) {
    await Task.updateMany(
      {
        _id: { $in: [...notifiedTaskIds] },
      },
      {
        $set: { overdueNotifiedAt: now },
      }
    ).exec();
  }

  return {
    skipped: false,
    reason: null,
    totalOverdueTasks: overdueTasks.length,
    notifiedUsers,
    notifiedTasks: notifiedTaskIds.size,
  };
};

module.exports = {
  notifyOverdueTasks,
};

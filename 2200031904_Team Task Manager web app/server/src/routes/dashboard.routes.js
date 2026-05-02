const express = require("express");
const ActivityLog = require("../models/activityLog.model");
const Project = require("../models/project.model");
const Task = require("../models/task.model");
const auth = require("../middlewares/auth");
const { getAccessibleProjectIds, toObjectId } = require("../utils/projectAccess");

const router = express.Router();

const emptyStatusMap = () => ({
  TODO: 0,
  IN_PROGRESS: 0,
  DONE: 0,
});

const buildStatusMap = (tasks) => {
  const map = emptyStatusMap();
  tasks.forEach((task) => {
    if (map[task.status] !== undefined) {
      map[task.status] += 1;
    }
  });
  return map;
};

const toDate = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isOverdue = (task, now) => {
  const dueDate = toDate(task.dueDate);
  return Boolean(dueDate && task.status !== "DONE" && dueDate < now);
};

const isUpcoming = (task, now) => {
  const dueDate = toDate(task.dueDate);
  return Boolean(dueDate && task.status !== "DONE" && dueDate >= now);
};

const isDueToday = (task, now) => {
  const dueDate = toDate(task.dueDate);
  return Boolean(dueDate && dueDate.toDateString() === now.toDateString());
};

router.get("/", auth, async (req, res) => {
  const now = new Date();
  const accessibleProjectIds = await getAccessibleProjectIds(req.user.id, req.user.role);
  const accessibleProjectObjectIds = accessibleProjectIds.map(toObjectId).filter(Boolean);

  const projectFilter =
    req.user.role === "ADMIN"
      ? {}
      : {
          _id: { $in: accessibleProjectObjectIds },
        };

  const visibleTaskFilter =
    req.user.role === "ADMIN"
      ? {}
      : {
          projectId: { $in: accessibleProjectObjectIds },
        };

  const visibleActivityFilter =
    req.user.role === "ADMIN"
      ? {}
      : {
          projectId: { $in: accessibleProjectObjectIds },
        };

  const [projectsRaw, visibleTasksRaw, myTasksRaw, recentActivityRaw] = await Promise.all([
    Project.find(projectFilter)
      .populate({ path: "owner", select: "name email role" })
      .sort({ createdAt: -1 })
      .exec(),
    Task.find(visibleTaskFilter)
      .populate({ path: "project", select: "name" })
      .populate({ path: "assignee", select: "name email role" })
      .sort({ updatedAt: -1 })
      .exec(),
    Task.find({ assigneeId: req.user.id })
      .populate({ path: "project", select: "name" })
      .populate({ path: "assignee", select: "name email role" })
      .sort({ updatedAt: -1 })
      .exec(),
    ActivityLog.find(visibleActivityFilter)
      .populate({ path: "actor", select: "name email role" })
      .populate({ path: "taskId", select: "title status" })
      .sort({ createdAt: -1 })
      .limit(12)
      .exec(),
  ]);

  const projects = projectsRaw.map((project) => project.toJSON());
  const visibleTasks = visibleTasksRaw.map((task) => task.toJSON());
  const myTasks = myTasksRaw.map((task) => task.toJSON());
  const recentActivity = recentActivityRaw.map((entry) => entry.toJSON());

  const myTaskStatus = buildStatusMap(myTasks);
  const visibleTaskStatus = buildStatusMap(visibleTasks);

  const myOverdueTasks = myTasks.filter((task) => isOverdue(task, now));
  const myUpcomingTasks = myTasks.filter((task) => isUpcoming(task, now));
  const teamOverdueTasks = visibleTasks.filter((task) => isOverdue(task, now));
  const teamUpcomingTasks = visibleTasks.filter((task) => isUpcoming(task, now));
  const dueTodayTasks = visibleTasks.filter((task) => isDueToday(task, now));

  const overdueTasks = teamOverdueTasks
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 20);
  const upcomingTasks = teamUpcomingTasks
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 30);
  const recentTasks = [...visibleTasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 60);

  const tasksByProjectId = new Map();
  visibleTasks.forEach((task) => {
    const entries = tasksByProjectId.get(task.projectId) || [];
    entries.push(task);
    tasksByProjectId.set(task.projectId, entries);
  });

  const projectSummaries = projects
    .map((project) => {
      const tasks = tasksByProjectId.get(project.id) || [];
      const status = buildStatusMap(tasks);
      const overdueCount = tasks.filter((task) => isOverdue(task, now)).length;
      const dueTodayCount = tasks.filter((task) => isDueToday(task, now)).length;
      const completionRate = tasks.length ? Math.round((status.DONE / tasks.length) * 100) : 0;

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        owner: project.owner,
        taskCount: tasks.length,
        todoCount: status.TODO,
        inProgressCount: status.IN_PROGRESS,
        doneCount: status.DONE,
        overdueCount,
        dueTodayCount,
        completionRate,
      };
    })
    .sort((a, b) => b.overdueCount - a.overdueCount || b.taskCount - a.taskCount);

  const workloadMap = new Map();
  visibleTasks.forEach((task) => {
    if (!task.assignee?.id) {
      return;
    }

    const existing = workloadMap.get(task.assignee.id) || {
      userId: task.assignee.id,
      user: task.assignee,
      total: 0,
      todo: 0,
      inProgress: 0,
      done: 0,
      overdue: 0,
    };

    existing.total += 1;
    if (task.status === "TODO") {
      existing.todo += 1;
    } else if (task.status === "IN_PROGRESS") {
      existing.inProgress += 1;
    } else if (task.status === "DONE") {
      existing.done += 1;
    }

    if (isOverdue(task, now)) {
      existing.overdue += 1;
    }

    workloadMap.set(task.assignee.id, existing);
  });

  const workloadByMember = [...workloadMap.values()].sort(
    (a, b) => b.overdue - a.overdue || b.total - a.total
  );

  const endedProjectCount = projectSummaries.filter(
    (project) => project.taskCount > 0 && project.completionRate === 100
  ).length;
  const runningProjectCount = projectSummaries.filter(
    (project) => project.inProgressCount > 0
  ).length;
  const pendingProjectCount = projectSummaries.filter(
    (project) => project.taskCount > 0 && project.todoCount === project.taskCount
  ).length;

  const totalVisibleTasks = visibleTasks.length;
  const completionRate = totalVisibleTasks
    ? Math.round((visibleTaskStatus.DONE / totalVisibleTasks) * 100)
    : 0;

  return res.json({
    summary: {
      role: req.user.role,
      projectCount: projects.length,
      totalVisibleTasks,
      myTaskCount: myTasks.length,
      myTaskStatus,
      visibleTaskStatus,
      overdueCount: teamOverdueTasks.length,
      myOverdueCount: myOverdueTasks.length,
      dueTodayCount: dueTodayTasks.length,
      completionRate,
      endedProjectCount,
      runningProjectCount,
      pendingProjectCount,
    },
    overdueTasks,
    upcomingTasks,
    recentTasks,
    myOverdueTasks,
    myUpcomingTasks,
    projectSummaries,
    workloadByMember,
    recentActivity,
  });
});

module.exports = router;

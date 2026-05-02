const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const Task = require("../models/task.model");
const ProjectMember = require("../models/projectMember.model");
const auth = require("../middlewares/auth");
const allowRoles = require("../middlewares/rbac");
const validate = require("../middlewares/validate");
const HttpError = require("../utils/httpError");
const { getProjectWithAccess } = require("../utils/projectAccess");
const { sortTasksForDisplay } = require("../utils/taskSort");
const { notifyOverdueTasks } = require("../services/overdueNotifier");
const { logTaskActivity } = require("../utils/activityLogger");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, callback) => callback(null, uploadsDir),
    filename: (_, file, callback) => {
      const extension = path.extname(file.originalname || "");
      const baseName = path
        .basename(file.originalname || "attachment", extension)
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80);
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${baseName || "attachment"}-${unique}${extension}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const fieldLabels = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  assigneeId: "Assignee",
  startDate: "Start Date",
  dueDate: "Due Date",
};

const projectIdParamsSchema = z.object({
  projectId: z.string().min(1, "Invalid project id"),
});

const taskIdParamsSchema = z.object({
  taskId: z.string().min(1, "Invalid task id"),
});

const taskAttachmentParamsSchema = z.object({
  taskId: z.string().min(1, "Invalid task id"),
  attachmentId: z.string().min(1, "Invalid attachment id"),
});

const parseOptionalDate = (value, label) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Invalid ${label}`);
  }

  return date;
};

const ensureDateWindow = (startDate, dueDate) => {
  if (!startDate || !dueDate) {
    return;
  }

  if (dueDate.getTime() < startDate.getTime()) {
    throw new HttpError(400, "Due date must be on or after start date");
  }
};

const createTaskSchema = z.object({
  title: z.string().min(3, "Task title should be at least 3 characters"),
  description: z.string().max(500).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  assigneeId: z.string().min(1, "Assignee id is required"),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(3, "Task title should be at least 3 characters").optional(),
    description: z.string().max(500).optional(),
    status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    assigneeId: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const toComparable = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

const buildTaskFieldChanges = (existingTask, updatePayload) => {
  const changes = [];
  Object.keys(updatePayload).forEach((field) => {
    if (!fieldLabels[field]) {
      return;
    }

    const before = toComparable(existingTask[field]);
    const after = toComparable(updatePayload[field]);
    if (before === after) {
      return;
    }

    changes.push({
      field: fieldLabels[field] || field,
      from: before,
      to: after,
    });
  });
  return changes;
};

const ensureTaskAccess = async (taskId, user) => {
  const task = await Task.findById(taskId)
    .populate({
      path: "project",
      select: "ownerId",
    })
    .exec();

  if (!task) {
    throw new HttpError(404, "Task not found");
  }

  const projectMembers = await ProjectMember.find({
    projectId: task.projectId,
  })
    .select("userId")
    .lean();

  const isProjectMember =
    task.project.ownerId.toString() === user.id ||
    projectMembers.some((member) => String(member.userId) === user.id);

  if (user.role !== "ADMIN" && !isProjectMember) {
    throw new HttpError(403, "You do not have access to this task");
  }

  return { task, projectMembers };
};

router.post(
  "/projects/:projectId/tasks",
  auth,
  allowRoles("ADMIN"),
  validate({ params: projectIdParamsSchema, body: createTaskSchema }),
  async (req, res) => {
    const { projectId } = req.params;
    const { title, description, status, priority, startDate, dueDate, assigneeId } = req.body;

    const { project } = await getProjectWithAccess(projectId, req.user.id, req.user.role);
    const assigneeAllowed =
      project.ownerId === assigneeId ||
      project.members.some((member) => member.userId === assigneeId);

    if (!assigneeAllowed) {
      throw new HttpError(400, "Assignee must belong to this project");
    }

    const parsedStartDate = parseOptionalDate(startDate, "start date");
    const parsedDueDate = parseOptionalDate(dueDate, "due date");
    ensureDateWindow(parsedStartDate, parsedDueDate);

    const task = await Task.create({
      title,
      description,
      status,
      priority,
      startDate: parsedStartDate,
      dueDate: parsedDueDate,
      projectId,
      assigneeId,
      createdById: req.user.id,
    });

    await task.populate([
      { path: "assignee", select: "name email role" },
      { path: "createdBy", select: "name email role" },
    ]);

    await logTaskActivity({
      projectId,
      taskId: task.id,
      actorId: req.user.id,
      action: "TASK_CREATED",
      message: `${req.user.name} created task "${task.title}"`,
      fieldChanges: [],
    });

    return res.status(201).json({
      message: "Task created successfully",
      task,
    });
  }
);

router.get(
  "/projects/:projectId/tasks",
  auth,
  validate({ params: projectIdParamsSchema }),
  async (req, res) => {
    const { projectId } = req.params;
    await getProjectWithAccess(projectId, req.user.id, req.user.role);

    const tasks = await Task.find({ projectId })
      .populate({ path: "assignee", select: "name email role" })
      .populate({ path: "createdBy", select: "name email role" })
      .exec();

    return res.json({ tasks: sortTasksForDisplay(tasks.map((task) => task.toJSON())) });
  }
);

router.patch(
  "/tasks/:taskId",
  auth,
  validate({ params: taskIdParamsSchema, body: updateTaskSchema }),
  async (req, res) => {
    const { taskId } = req.params;
    const payload = { ...req.body };

    const { task, projectMembers } = await ensureTaskAccess(taskId, req.user);

    if (req.user.role !== "ADMIN") {
      if (task.assigneeId.toString() !== req.user.id) {
        throw new HttpError(403, "Only assignee can update this task");
      }

      const nonStatusFields = Object.keys(payload).filter((field) => field !== "status");
      if (nonStatusFields.length > 0) {
        throw new HttpError(403, "Members can only update task status");
      }
    }

    if (payload.assigneeId) {
      const assigneeAllowed =
        task.project.ownerId.toString() === payload.assigneeId ||
        projectMembers.some((member) => String(member.userId) === payload.assigneeId);

      if (!assigneeAllowed) {
        throw new HttpError(400, "New assignee must belong to the same project");
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "dueDate")) {
      payload.dueDate = parseOptionalDate(payload.dueDate, "due date");
    }

    if (Object.prototype.hasOwnProperty.call(payload, "startDate")) {
      payload.startDate = parseOptionalDate(payload.startDate, "start date");
    }

    const nextStartDate = Object.prototype.hasOwnProperty.call(payload, "startDate")
      ? payload.startDate
      : task.startDate;
    const nextDueDate = Object.prototype.hasOwnProperty.call(payload, "dueDate")
      ? payload.dueDate
      : task.dueDate;

    ensureDateWindow(nextStartDate, nextDueDate);

    if (Object.prototype.hasOwnProperty.call(payload, "dueDate")) {
      payload.overdueNotifiedAt = null;
    }

    const fieldChanges = buildTaskFieldChanges(task, payload);

    const updatedTask = await Task.findByIdAndUpdate(taskId, payload, {
      new: true,
      runValidators: true,
    })
      .populate({ path: "assignee", select: "name email role" })
      .populate({ path: "createdBy", select: "name email role" })
      .exec();

    if (fieldChanges.length > 0) {
      const isOnlyStatusChange =
        fieldChanges.length === 1 && fieldChanges[0].field === fieldLabels.status;
      await logTaskActivity({
        projectId: task.projectId,
        taskId: task.id,
        actorId: req.user.id,
        action: isOnlyStatusChange ? "TASK_STATUS_CHANGED" : "TASK_UPDATED",
        message: isOnlyStatusChange
          ? `${req.user.name} changed status for "${updatedTask.title}"`
          : `${req.user.name} updated "${updatedTask.title}"`,
        fieldChanges,
      });
    }

    return res.json({
      message: "Task updated successfully",
      task: updatedTask,
    });
  }
);

router.post(
  "/tasks/:taskId/attachments",
  auth,
  validate({ params: taskIdParamsSchema }),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Attachment file is required");
    }

    const { taskId } = req.params;

    try {
      const { task } = await ensureTaskAccess(taskId, req.user);
      const attachment = {
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        filePath: req.file.path,
        mimeType: req.file.mimetype || "application/octet-stream",
        size: req.file.size,
        uploadedById: req.user.id,
      };

      task.attachments.push(attachment);
      await task.save();

      const createdAttachment = task.attachments[task.attachments.length - 1];

      await logTaskActivity({
        projectId: task.projectId,
        taskId: task.id,
        actorId: req.user.id,
        action: "TASK_ATTACHMENT_ADDED",
        message: `${req.user.name} attached "${req.file.originalname}" to "${task.title}"`,
        fieldChanges: [],
      });

      return res.status(201).json({
        message: "Attachment uploaded successfully",
        attachment: createdAttachment,
      });
    } catch (error) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      throw error;
    }
  }
);

router.delete(
  "/tasks/:taskId/attachments/:attachmentId",
  auth,
  validate({ params: taskAttachmentParamsSchema }),
  async (req, res) => {
    const { taskId, attachmentId } = req.params;
    const { task } = await ensureTaskAccess(taskId, req.user);

    const targetAttachment = task.attachments.find(
      (attachment) => String(attachment.id) === attachmentId
    );

    if (!targetAttachment) {
      throw new HttpError(404, "Attachment not found");
    }

    const canDelete =
      req.user.role === "ADMIN" ||
      String(targetAttachment.uploadedById) === req.user.id ||
      String(task.assigneeId) === req.user.id;

    if (!canDelete) {
      throw new HttpError(403, "You cannot remove this attachment");
    }

    const filePath = targetAttachment.filePath;
    task.attachments.pull({ _id: attachmentId });
    await task.save();
    await fsPromises.unlink(filePath).catch(() => {});

    await logTaskActivity({
      projectId: task.projectId,
      taskId: task.id,
      actorId: req.user.id,
      action: "TASK_ATTACHMENT_REMOVED",
      message: `${req.user.name} removed "${targetAttachment.fileName}" from "${task.title}"`,
      fieldChanges: [],
    });

    return res.json({ message: "Attachment removed successfully" });
  }
);

router.post("/tasks/notify-overdue", auth, allowRoles("ADMIN"), async (req, res) => {
  const result = await notifyOverdueTasks();

  return res.json({
    message: result.skipped
      ? "Notification run skipped"
      : "Overdue notification run completed",
    result,
  });
});

module.exports = router;

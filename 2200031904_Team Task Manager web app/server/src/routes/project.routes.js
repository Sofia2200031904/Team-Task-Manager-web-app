const express = require("express");
const { z } = require("zod");
const Project = require("../models/project.model");
const ProjectMember = require("../models/projectMember.model");
const Task = require("../models/task.model");
const User = require("../models/user.model");
const ActivityLog = require("../models/activityLog.model");
const auth = require("../middlewares/auth");
const allowRoles = require("../middlewares/rbac");
const validate = require("../middlewares/validate");
const HttpError = require("../utils/httpError");
const { getAccessibleProjects, getProjectWithAccess } = require("../utils/projectAccess");
const { sortTasksForDisplay } = require("../utils/taskSort");

const router = express.Router();

const projectIdParamsSchema = z.object({
  projectId: z.string().min(1, "Invalid project id"),
});

const createProjectSchema = z.object({
  name: z.string().min(3, "Project name should be at least 3 characters"),
  description: z.string().max(300).optional(),
});

const manageMemberSchema = z.object({
  userId: z.string().min(1, "User id is required"),
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const sanitizeProject = (project) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  owner: project.owner,
  members: project.members.map((member) => ({
    id: member.id,
    userId: member.userId,
    createdAt: member.createdAt,
    user: member.user,
  })),
  counts: project._count,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

router.post(
  "/",
  auth,
  allowRoles("ADMIN"),
  validate({ body: createProjectSchema }),
  async (req, res) => {
    const { name, description } = req.body;

    const project = await Project.create({
      name,
      description,
      ownerId: req.user.id,
    });

    await ProjectMember.create({
      projectId: project.id,
      userId: req.user.id,
    });

    const { project: savedProject } = await getProjectWithAccess(
      project.id,
      req.user.id,
      req.user.role
    );

    return res.status(201).json({
      message: "Project created successfully",
      project: sanitizeProject(savedProject),
    });
  }
);

router.get("/", auth, async (req, res) => {
  const projects = await getAccessibleProjects(req.user.id, req.user.role);

  return res.json({
    projects: projects.map(sanitizeProject),
  });
});

router.get(
  "/:projectId",
  auth,
  validate({ params: projectIdParamsSchema }),
  async (req, res) => {
    const { project } = await getProjectWithAccess(
      req.params.projectId,
      req.user.id,
      req.user.role
    );

    const tasks = await Task.find({ projectId: project.id })
      .populate({ path: "assignee", select: "name email role" })
      .populate({ path: "createdBy", select: "name email role" })
      .exec();

    return res.json({
      project: {
        ...sanitizeProject(project),
        tasks: sortTasksForDisplay(tasks.map((task) => task.toJSON())),
      },
    });
  }
);

router.get(
  "/:projectId/activity",
  auth,
  validate({ params: projectIdParamsSchema, query: activityQuerySchema }),
  async (req, res) => {
    const { projectId } = req.params;
    const limit = req.query.limit || 50;

    await getProjectWithAccess(projectId, req.user.id, req.user.role);

    const activity = await ActivityLog.find({ projectId })
      .populate({ path: "actor", select: "name email role" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return res.json({ activity });
  }
);

router.post(
  "/:projectId/members",
  auth,
  allowRoles("ADMIN"),
  validate({ params: projectIdParamsSchema, body: manageMemberSchema }),
  async (req, res) => {
    const { projectId } = req.params;
    const { userId } = req.body;

    await getProjectWithAccess(projectId, req.user.id, req.user.role);

    const user = await User.findById(userId)
      .select("name email role")
      .exec();

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const existingMember = await ProjectMember.findOne({
      projectId,
      userId,
    }).exec();

    if (existingMember) {
      throw new HttpError(409, "User is already part of this project");
    }

    const member = await ProjectMember.create({
      projectId,
      userId,
    });

    await member.populate({ path: "user", select: "name email role" });

    return res.status(201).json({
      message: "Member added successfully",
      member,
    });
  }
);

router.delete(
  "/:projectId/members/:userId",
  auth,
  allowRoles("ADMIN"),
  validate({
    params: z.object({
      projectId: z.string().min(1, "Invalid project id"),
      userId: z.string().min(1, "Invalid user id"),
    }),
  }),
  async (req, res) => {
    const { projectId, userId } = req.params;
    const { project } = await getProjectWithAccess(projectId, req.user.id, req.user.role);

    if (project.ownerId === userId) {
      throw new HttpError(400, "Project owner cannot be removed");
    }

    const assignedTaskCount = await Task.countDocuments({
      projectId,
      assigneeId: userId,
    });

    if (assignedTaskCount > 0) {
      throw new HttpError(
        400,
        "Cannot remove this member while tasks are still assigned. Reassign tasks first."
      );
    }

    const deleted = await ProjectMember.deleteOne({
      projectId,
      userId,
    }).exec();

    if (deleted.deletedCount === 0) {
      throw new HttpError(404, "Member not found in this project");
    }

    return res.json({ message: "Member removed successfully" });
  }
);

module.exports = router;

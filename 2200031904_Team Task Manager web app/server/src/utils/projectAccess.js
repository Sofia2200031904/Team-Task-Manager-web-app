const mongoose = require("mongoose");
const Project = require("../models/project.model");
const ProjectMember = require("../models/projectMember.model");
const Task = require("../models/task.model");
const HttpError = require("./httpError");

const userSelect = "name email role";

const toObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};

const dedupeIds = (ids) => [...new Set(ids.map((id) => String(id)))];

const getAccessibleProjectIds = async (userId, role) => {
  if (role === "ADMIN") {
    const allProjects = await Project.find({}, "_id").lean();
    return allProjects.map((project) => String(project._id));
  }

  const [ownedProjects, memberships] = await Promise.all([
    Project.find({ ownerId: userId }, "_id").lean(),
    ProjectMember.find({ userId }, "projectId").lean(),
  ]);

  return dedupeIds([
    ...ownedProjects.map((project) => project._id),
    ...memberships.map((membership) => membership.projectId),
  ]);
};

const hydrateProjectsByIds = async (projectIds) => {
  const objectIds = projectIds
    .map(toObjectId)
    .filter(Boolean);

  if (objectIds.length === 0) {
    return new Map();
  }

  const [projects, members, taskCountRows] = await Promise.all([
    Project.find({ _id: { $in: objectIds } })
      .populate({ path: "owner", select: userSelect })
      .sort({ createdAt: -1 }),
    ProjectMember.find({ projectId: { $in: objectIds } })
      .populate({ path: "user", select: userSelect })
      .sort({ createdAt: 1 }),
    Task.aggregate([
      { $match: { projectId: { $in: objectIds } } },
      { $group: { _id: "$projectId", count: { $sum: 1 } } },
    ]),
  ]);

  const membersByProjectId = new Map();
  members.forEach((member) => {
    const key = String(member.projectId);
    const entries = membersByProjectId.get(key) || [];
    entries.push(member.toJSON());
    membersByProjectId.set(key, entries);
  });

  const taskCountByProjectId = new Map(
    taskCountRows.map((row) => [String(row._id), row.count])
  );

  const hydratedProjects = new Map();
  projects.forEach((projectDoc) => {
    const project = projectDoc.toJSON();
    const projectMembers = membersByProjectId.get(project.id) || [];

    hydratedProjects.set(project.id, {
      ...project,
      members: projectMembers,
      _count: {
        members: projectMembers.length,
        tasks: taskCountByProjectId.get(project.id) || 0,
      },
    });
  });

  return hydratedProjects;
};

const getAccessibleProjects = async (userId, role) => {
  const projectIds = await getAccessibleProjectIds(userId, role);
  const projectMap = await hydrateProjectsByIds(projectIds);

  return projectIds
    .map((projectId) => projectMap.get(projectId))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const getProjectWithAccess = async (projectId, userId, role) => {
  const projectMap = await hydrateProjectsByIds([projectId]);
  const project = projectMap.get(projectId);

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  const isOwner = project.ownerId === userId;
  const isMember = project.members.some((member) => member.userId === userId);
  const isAdmin = role === "ADMIN";

  if (!isOwner && !isMember && !isAdmin) {
    throw new HttpError(403, "You do not have access to this project");
  }

  return {
    project,
    isOwner,
    isMember,
    isAdmin,
  };
};

module.exports = {
  getAccessibleProjectIds,
  getAccessibleProjects,
  getProjectWithAccess,
  toObjectId,
};

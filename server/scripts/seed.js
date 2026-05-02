require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const User = require("../src/models/user.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const Task = require("../src/models/task.model");
const ActivityLog = require("../src/models/activityLog.model");

const suggestedProjects = [
  {
    name: "Team Task Manager with Role-Based Access",
    description:
      "A full-stack web app where teams can create projects, assign tasks, and track progress with secure authentication and role-based permissions.",
  },
  {
    name: "Smart Project Collaboration Platform",
    description:
      "A collaborative platform that helps teams manage projects, assign responsibilities, and monitor deadlines with dashboard insights.",
  },
  {
    name: "TaskFlow - Team Productivity Tracker",
    description:
      "A productivity-focused application for organizing tasks within projects and visualizing progress through a clean dashboard.",
  },
  {
    name: "WorkSync - Project and Task Management System",
    description:
      "A centralized system for managing team workflows where admins control projects and members update progress.",
  },
  {
    name: "CollabTrack - Multi-User Task Management App",
    description:
      "A scalable web app for collaboration with authentication, role-based access, project creation, and task assignment.",
  },
  {
    name: "ProManage - Full-Stack Project Management Tool",
    description:
      "An end-to-end project management solution with REST APIs and a responsive UI for efficient task handling and deadline tracking.",
  },
  {
    name: "AgileBoard - Kanban-Based Task Manager",
    description:
      "A Kanban-style app where users move tasks across To Do, In Progress, and Done to support agile team workflows.",
  },
  {
    name: "TaskSphere - Role-Based Team Dashboard",
    description:
      "A web app with a personalized dashboard showing assigned tasks, deadlines, and progress summaries inside a structured project hierarchy.",
  },
  {
    name: "SprintMate - Deadline and Task Tracking System",
    description:
      "A sprint-based tracking system for short-term goals that highlights overdue tasks and gives clear team performance visibility.",
  },
  {
    name: "FlowDesk - Collaborative Work Management App",
    description:
      "A modern application for project organization, task assignments, and performance tracking through an intuitive interface.",
  },
];

const ensureProjectMembers = async (projectId, adminId, memberId) => {
  await ProjectMember.updateOne(
    { projectId, userId: adminId },
    { $setOnInsert: { projectId, userId: adminId } },
    { upsert: true }
  );

  await ProjectMember.updateOne(
    { projectId, userId: memberId },
    { $setOnInsert: { projectId, userId: memberId } },
    { upsert: true }
  );
};

const createProjectIfMissing = async ({ name, description, ownerId, adminId, memberId }) => {
  let project = await Project.findOne({ name, ownerId }).exec();
  if (!project) {
    project = await Project.create({
      name,
      description,
      ownerId,
    });
  }

  await ensureProjectMembers(project.id, adminId, memberId);
  return project;
};

const buildDate = (offsetDays) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);

const createTaskIfMissing = async ({
  projectId,
  title,
  description,
  status,
  priority,
  startOffsetDays,
  dueOffsetDays,
  assigneeId,
  createdById,
}) => {
  const existingTask = await Task.findOne({ projectId, title }).exec();
  if (existingTask) {
    return { task: existingTask, created: false };
  }

  const task = await Task.create({
    title,
    description,
    status,
    priority,
    startDate: startOffsetDays !== null ? buildDate(startOffsetDays) : null,
    dueDate: dueOffsetDays !== null ? buildDate(dueOffsetDays) : null,
    projectId,
    assigneeId,
    createdById,
  });

  return { task, created: true };
};

const createActivityIfMissing = async ({ projectId, taskId, actorId, action, message }) => {
  const existing = await ActivityLog.findOne({
    projectId,
    taskId,
    actorId,
    action,
    message,
  }).exec();

  if (existing) {
    return;
  }

  await ActivityLog.create({
    projectId,
    taskId,
    actorId,
    action,
    message,
  });
};

const seed = async () => {
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const memberPassword = await bcrypt.hash("Member@123", 10);

  let admin = await User.findOne({ email: "admin@teamtask.com" }).select("+password").exec();
  if (!admin) {
    admin = await User.create({
      name: "Project Admin",
      email: "admin@teamtask.com",
      password: adminPassword,
      role: "ADMIN",
    });
  }

  let member = await User.findOne({ email: "member@teamtask.com" }).select("+password").exec();
  if (!member) {
    member = await User.create({
      name: "Team Member",
      email: "member@teamtask.com",
      password: memberPassword,
      role: "MEMBER",
    });
  }

  const onboardingProject = await createProjectIfMissing({
    name: "Website Redesign",
    description: "Revamp the marketing website and optimize task workflow.",
    ownerId: admin.id,
    adminId: admin.id,
    memberId: member.id,
  });

  const createdSuggestedProjects = [];

  for (const projectData of suggestedProjects) {
    const project = await createProjectIfMissing({
      ...projectData,
      ownerId: admin.id,
      adminId: admin.id,
      memberId: member.id,
    });
    createdSuggestedProjects.push(project);
  }

  const onboardingTask = await createTaskIfMissing({
    projectId: onboardingProject.id,
    title: "Create landing page wireframe",
    description: "Prepare mobile and desktop wireframes for hero and features section.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    startOffsetDays: -2,
    dueOffsetDays: 3,
    assigneeId: member.id,
    createdById: admin.id,
  });
  await createActivityIfMissing({
    projectId: onboardingProject.id,
    taskId: onboardingTask.task.id,
    actorId: admin.id,
    action: "TASK_CREATED",
    message: `${admin.name} created task "${onboardingTask.task.title}"`,
  });

  const allProjects = [onboardingProject, ...createdSuggestedProjects];
  const demoTaskTemplates = [
    {
      titleSuffix: "Kickoff and Requirement Mapping",
      description:
        "Collect requirements, define scope, and align owners for each deliverable.",
      status: "TODO",
      priority: "MEDIUM",
      startOffsetDays: 0,
      dueOffsetDays: 5,
    },
    {
      titleSuffix: "Core Execution Sprint",
      description:
        "Implement the main feature set and track blockers with daily status updates.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      startOffsetDays: -3,
      dueOffsetDays: 4,
    },
    {
      titleSuffix: "QA, Review and Final Signoff",
      description:
        "Validate completed work, run acceptance checks, and finalize closure notes.",
      status: "DONE",
      priority: "LOW",
      startOffsetDays: -9,
      dueOffsetDays: -2,
    },
  ];

  for (let index = 0; index < allProjects.length; index += 1) {
    const project = allProjects[index];
    const defaultAssigneeId = index % 2 === 0 ? member.id : admin.id;

    for (const template of demoTaskTemplates) {
      const seededTask = await createTaskIfMissing({
        projectId: project.id,
        title: `${project.name}: ${template.titleSuffix}`,
        description: template.description,
        status: template.status,
        priority: template.priority,
        startOffsetDays: template.startOffsetDays,
        dueOffsetDays: template.dueOffsetDays,
        assigneeId: defaultAssigneeId,
        createdById: admin.id,
      });
      await createActivityIfMissing({
        projectId: project.id,
        taskId: seededTask.task.id,
        actorId: admin.id,
        action: "TASK_CREATED",
        message: `${admin.name} created task "${seededTask.task.title}"`,
      });
    }

    if (index % 3 === 0) {
      const escalationTask = await createTaskIfMissing({
        projectId: project.id,
        title: `${project.name}: Escalation Follow-up`,
        description:
          "Follow up on critical pending issues and reduce overdue backlog items.",
        status: "TODO",
        priority: "HIGH",
        startOffsetDays: -6,
        dueOffsetDays: -1,
        assigneeId: member.id,
        createdById: admin.id,
      });
      await createActivityIfMissing({
        projectId: project.id,
        taskId: escalationTask.task.id,
        actorId: admin.id,
        action: "TASK_CREATED",
        message: `${admin.name} created task "${escalationTask.task.title}"`,
      });
    }
  }
};

const run = async () => {
  try {
    await connectDatabase();
    await seed();
    // eslint-disable-next-line no-console
    console.log("Seed completed");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

run();

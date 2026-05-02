import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const initialTaskForm = {
  projectId: "",
  title: "",
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  startDate: "",
  dueDate: "",
  assigneeId: "",
};

const chartCenter = 110;
const chartRadius = 82;
const chartCircumference = 2 * Math.PI * chartRadius;

const DashboardPage = () => {
  const { user } = useAuth();
  const canCreateTask = user?.role === "ADMIN";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSegment, setActiveSegment] = useState("DONE");

  const [projects, setProjects] = useState([]);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskSuccess, setTaskSuccess] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/dashboard");
      setData(response.data);
      setError("");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    if (!canCreateTask) {
      return;
    }

    try {
      const { data: projectData } = await api.get("/projects");
      setProjects(projectData.projects || []);
      setTaskError("");
    } catch (apiError) {
      setTaskError(apiError?.response?.data?.message || "Unable to load projects");
    }
  }, [canCreateTask]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (canCreateTask) {
      loadProjects();
    }
  }, [canCreateTask, loadProjects]);

  useEffect(() => {
    if (!projects.length) {
      setTaskForm((prev) => ({
        ...prev,
        projectId: "",
        assigneeId: "",
      }));
      return;
    }

    setTaskForm((prev) => {
      const selectedProject = projects.find((project) => project.id === prev.projectId) || projects[0];
      const assigneeIsValid = selectedProject.members.some(
        (member) => member.userId === prev.assigneeId
      );

      return {
        ...prev,
        projectId: selectedProject.id,
        assigneeId: assigneeIsValid ? prev.assigneeId : selectedProject.members[0]?.userId || "",
      };
    });
  }, [projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === taskForm.projectId) || null,
    [projects, taskForm.projectId]
  );

  const summary = data?.summary;
  const statusCounts = summary?.visibleTaskStatus || summary?.myTaskStatus || {};
  const todoCount = statusCounts?.TODO ?? 0;
  const inProgressCount = statusCounts?.IN_PROGRESS ?? 0;
  const doneCount = statusCounts?.DONE ?? 0;
  const totalByStatus = todoCount + inProgressCount + doneCount;

  const statusSegments = useMemo(
    () => [
      { key: "TODO", label: "To Do", value: todoCount, color: "var(--status-todo)" },
      {
        key: "IN_PROGRESS",
        label: "In Progress",
        value: inProgressCount,
        color: "var(--status-progress)",
      },
      { key: "DONE", label: "Done", value: doneCount, color: "var(--status-done)" },
    ],
    [doneCount, inProgressCount, todoCount]
  );

  const donutSegments = useMemo(() => {
    if (!totalByStatus) {
      return [];
    }

    let cumulative = 0;
    return statusSegments
      .filter((segment) => segment.value > 0)
      .map((segment) => {
        const ratio = segment.value / totalByStatus;
        const length = ratio * chartCircumference;
        const item = {
          ...segment,
          percentage: Math.round(ratio * 100),
          length,
          dashOffset: -cumulative,
        };
        cumulative += length;
        return item;
      });
  }, [statusSegments, totalByStatus]);

  const selectedSegment =
    donutSegments.find((segment) => segment.key === activeSegment) || donutSegments[0] || null;

  const upcomingProjectGroups = useMemo(() => {
    const grouped = new Map();
    (data?.upcomingTasks || []).forEach((task) => {
      const key = task.project?.id || task.project?.name || task.projectId;
      if (!key) {
        return;
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          projectName: task.project?.name || "Project",
          tasks: [],
          totalTasks: 0,
          earliestDue: task.dueDate || null,
        });
      }

      const group = grouped.get(key);
      group.totalTasks += 1;
      if (task.dueDate && (!group.earliestDue || dayjs(task.dueDate).isBefore(dayjs(group.earliestDue)))) {
        group.earliestDue = task.dueDate;
      }
      if (group.tasks.length < 3) {
        group.tasks.push(task);
      }
    });

    return [...grouped.values()].sort((a, b) => {
      if (!a.earliestDue && !b.earliestDue) {
        return 0;
      }
      if (!a.earliestDue) {
        return 1;
      }
      if (!b.earliestDue) {
        return -1;
      }
      return new Date(a.earliestDue).getTime() - new Date(b.earliestDue).getTime();
    });
  }, [data?.upcomingTasks]);

  const handleProjectChange = (projectId) => {
    const project = projects.find((item) => item.id === projectId);
    setTaskForm((prev) => ({
      ...prev,
      projectId,
      assigneeId: project?.members?.[0]?.userId || "",
    }));
  };

  const createTask = async (event) => {
    event.preventDefault();

    if (!taskForm.projectId || !taskForm.assigneeId) {
      setTaskError("Please select both a project and an assignee.");
      return;
    }

    if (
      taskForm.startDate &&
      taskForm.dueDate &&
      dayjs(taskForm.dueDate).isBefore(dayjs(taskForm.startDate), "day")
    ) {
      setTaskError("Due date must be on or after start date.");
      return;
    }

    setTaskBusy(true);
    setTaskError("");
    setTaskSuccess("");

    try {
      await api.post(`/projects/${taskForm.projectId}/tasks`, {
        title: taskForm.title,
        description: taskForm.description || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        assigneeId: taskForm.assigneeId,
        startDate: taskForm.startDate || undefined,
        dueDate: taskForm.dueDate || undefined,
      });

      setTaskForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        status: "TODO",
        priority: "MEDIUM",
        startDate: "",
        dueDate: "",
      }));
      setTaskSuccess("Task created successfully.");

      await Promise.all([loadDashboard(), loadProjects()]);
    } catch (apiError) {
      setTaskError(apiError?.response?.data?.message || "Unable to create task");
    } finally {
      setTaskBusy(false);
    }
  };

  const runOverdueNotification = async () => {
    setNotifyBusy(true);
    setNotifyMessage("");

    try {
      const { data: responseData } = await api.post("/tasks/notify-overdue");
      const result = responseData?.result || {};
      if (result.skipped) {
        setNotifyMessage(`Notification skipped: ${result.reason || "Not configured"}`);
      } else {
        setNotifyMessage(
          `Notifications sent to ${result.notifiedUsers || 0} user(s) for ${result.notifiedTasks || 0} task(s).`
        );
      }
    } catch (apiError) {
      setNotifyMessage(apiError?.response?.data?.message || "Unable to trigger notifications.");
    } finally {
      setNotifyBusy(false);
    }
  };

  if (loading) {
    return <div className="state-box">Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="state-box">
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={loadDashboard}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="stack dashboard-v2-shell">
      <header className="dashboard-v2-hero">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Plan, prioritize, and track your team with clear project analytics and deadlines.
          </p>
        </div>
        <div className="hero-actions">
          <span className="hero-chip">Role: {summary?.role || user?.role}</span>
          {canCreateTask ? (
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={runOverdueNotification}
              disabled={notifyBusy}
            >
              {notifyBusy ? "Sending..." : "Send Overdue Emails"}
            </button>
          ) : null}
        </div>
      </header>
      {notifyMessage ? <div className="success-box">{notifyMessage}</div> : null}

      <div className="dashboard-v2-kpi-grid">
        <article className="stat-card stat-highlight">
          <h3>Total Projects</h3>
          <strong>{summary?.projectCount ?? 0}</strong>
          <p className="muted">Active workspace projects</p>
        </article>
        <article className="stat-card">
          <h3>Ended Projects</h3>
          <strong>{summary?.endedProjectCount ?? 0}</strong>
          <p className="muted">Fully completed</p>
        </article>
        <article className="stat-card">
          <h3>Running Projects</h3>
          <strong>{summary?.runningProjectCount ?? 0}</strong>
          <p className="muted">Tasks in progress</p>
        </article>
        <article className="stat-card">
          <h3>Pending Project</h3>
          <strong>{summary?.pendingProjectCount ?? 0}</strong>
          <p className="muted">Only backlog tasks</p>
        </article>
      </div>

      <div className="dashboard-v2-main-grid">
        <article className="panel dashboard-v2-analytics-panel">
          <h2>Project Analytics</h2>
          <div className="dashboard-v2-analytics-content">
            <div className="status-donut-card">
              <svg viewBox="0 0 220 220" role="img" aria-label="Task status chart">
                <circle
                  cx={chartCenter}
                  cy={chartCenter}
                  r={chartRadius}
                  fill="none"
                  stroke="rgba(58, 80, 71, 0.12)"
                  strokeWidth="24"
                />
                {donutSegments.map((segment) => (
                  <circle
                    key={segment.key}
                    cx={chartCenter}
                    cy={chartCenter}
                    r={chartRadius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={selectedSegment?.key === segment.key ? 30 : 24}
                    strokeLinecap="round"
                    strokeDasharray={`${segment.length} ${chartCircumference - segment.length}`}
                    strokeDashoffset={segment.dashOffset}
                    transform={`rotate(-90 ${chartCenter} ${chartCenter})`}
                    onMouseEnter={() => setActiveSegment(segment.key)}
                    onMouseLeave={() => setActiveSegment("DONE")}
                  />
                ))}
                <text
                  x={chartCenter}
                  y={chartCenter - 4}
                  textAnchor="middle"
                  className="status-donut-value"
                >
                  {selectedSegment ? selectedSegment.value : 0}
                </text>
                <text
                  x={chartCenter}
                  y={chartCenter + 18}
                  textAnchor="middle"
                  className="status-donut-label"
                >
                  {selectedSegment ? selectedSegment.label : "No Data"}
                </text>
              </svg>
            </div>
            <ul className="status-legend status-legend-interactive">
              {statusSegments.map((segment) => (
                <li key={segment.key}>
                  <button
                    type="button"
                    className={selectedSegment?.key === segment.key ? "is-active" : ""}
                    onMouseEnter={() => setActiveSegment(segment.key)}
                    onMouseLeave={() => setActiveSegment("DONE")}
                  >
                    <span className={`legend-dot dot-${segment.key.toLowerCase()}`} />
                    <span>{segment.label}</span>
                    <strong>{segment.value}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="panel dashboard-v2-upcoming-panel">
          <h2>Upcoming Deadlines</h2>
          {upcomingProjectGroups.length ? (
            <div className="deadline-project-grid deadline-project-scroll">
              {upcomingProjectGroups.map((projectGroup) => (
                <article key={projectGroup.key} className="deadline-project-card">
                  <h3>{projectGroup.projectName}</h3>
                  <ul>
                    {projectGroup.tasks.map((task) => (
                      <li key={task.id}>
                        <strong>{task.title}</strong>
                        <span>{task.assignee?.name || "-"}</span>
                        <span>{task.dueDate ? dayjs(task.dueDate).format("DD MMM YYYY") : "-"}</span>
                      </li>
                    ))}
                  </ul>
                  {projectGroup.totalTasks > projectGroup.tasks.length ? (
                    <p className="muted deadline-more">
                      +{projectGroup.totalTasks - projectGroup.tasks.length} more
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No upcoming team deadlines.</p>
          )}
        </article>

        <article className="panel dashboard-v2-workload-panel">
          <h2>Team Workload</h2>
          {data?.workloadByMember?.length ? (
            <ul className="simple-list">
              {data.workloadByMember.map((member) => (
                <li key={member.userId}>
                  <strong>{member.user?.name || "Member"}</strong>
                  <span>Total: {member.total}</span>
                  <span>In Progress: {member.inProgress}</span>
                  <span>Overdue: {member.overdue}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No workload data yet.</p>
          )}
        </article>

        <article className="panel dashboard-v2-activity-panel">
          <h2>Recent Activity</h2>
          {data?.recentActivity?.length ? (
            <ul className="activity-list compact-activity-list">
              {data.recentActivity.map((entry) => (
                <li key={entry.id}>
                  <div className="activity-head">
                    <strong>{entry.actor?.name || "User"}</strong>
                    <span>{dayjs(entry.createdAt).format("DD MMM, hh:mm A")}</span>
                  </div>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No recent activity.</p>
          )}
        </article>

        <article className="panel dashboard-v2-recent-panel">
          <h2>Recently Updated Tasks</h2>
          {data?.recentTasks?.length ? (
            <div className="recent-task-scroll">
              {data.recentTasks.map((task) => (
                <article key={task.id} className="recent-task-row">
                  <div>
                    <strong>{task.title}</strong>
                    <p className="muted">{task.project?.name || "-"}</p>
                  </div>
                  <div>
                    <span>{task.assignee?.name || "-"}</span>
                    <span className={`status-pill status-${task.status.toLowerCase()}`}>{task.status}</span>
                  </div>
                  <time>{dayjs(task.updatedAt).format("DD MMM, hh:mm A")}</time>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No recent task updates.</p>
          )}
        </article>
      </div>

      {canCreateTask ? (
        <article className="panel">
          <h2>Create Task</h2>
          {taskError ? <div className="error-box">{taskError}</div> : null}
          {taskSuccess ? <div className="success-box">{taskSuccess}</div> : null}

          {projects.length ? (
            <form className="form-grid task-form-grid" onSubmit={createTask}>
              <label>
                Project
                <select
                  value={taskForm.projectId}
                  onChange={(event) => handleProjectChange(event.target.value)}
                  required
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Assignee
                <select
                  value={taskForm.assigneeId}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, assigneeId: event.target.value }))
                  }
                  required
                >
                  {(selectedProject?.members || []).map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.user.name} ({member.user.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="full-span">
                Title
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="full-span">
                Description
                <textarea
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </label>

              <label>
                Priority
                <select
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, priority: event.target.value }))
                  }
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>

              <label>
                Status
                <select
                  value={taskForm.status}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DONE">Done</option>
                </select>
              </label>

              <label>
                Start Date
                <input
                  type="date"
                  value={taskForm.startDate}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </label>

              <label>
                Due Date
                <input
                  type="date"
                  min={taskForm.startDate || undefined}
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
              </label>

              <button type="submit" className="btn btn-primary" disabled={taskBusy}>
                {taskBusy ? "Saving..." : "Create Task"}
              </button>
            </form>
          ) : (
            <p className="muted">
              Create at least one project first. Then you can assign new tasks from this dashboard.
            </p>
          )}
        </article>
      ) : null}
    </section>
  );
};

export default DashboardPage;

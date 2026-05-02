import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const statusColumns = [
  { key: "TODO", label: "To Do" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "DONE", label: "Done" },
];

const formatDateTime = (value) => dayjs(value).format("DD MMM YYYY, hh:mm A");

const resolveAttachmentUrl = (fileUrl) => {
  if (!fileUrl) {
    return "#";
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const host = apiUrl.replace(/\/api\/?$/, "");
  return `${host}${fileUrl}`;
};

const ProjectDetailsPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [activity, setActivity] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachmentsBusyFor, setAttachmentsBusyFor] = useState({});

  const [memberUserId, setMemberUserId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [dragTaskId, setDragTaskId] = useState("");

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    startDate: "",
    dueDate: "",
    assigneeId: "",
  });

  const isAdmin = user?.role === "ADMIN";

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/projects/${projectId}`);
      setProject(data.project);
      setError("");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    try {
      const { data } = await api.get("/users/members");
      setAllUsers(data.users || []);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load users");
    }
  }, [isAdmin]);

  const loadActivity = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/activity`, {
        params: { limit: 80 },
      });
      setActivity(data.activity || []);
    } catch {
      setActivity([]);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (project?.members?.length && !taskForm.assigneeId) {
      setTaskForm((prev) => ({
        ...prev,
        assigneeId: project.members[0].userId,
      }));
    }
  }, [project, taskForm.assigneeId]);

  const availableUsers = useMemo(() => {
    if (!project) {
      return [];
    }
    const memberSet = new Set(project.members.map((member) => member.userId));
    return allUsers.filter((item) => !memberSet.has(item.id));
  }, [allUsers, project]);

  const filteredTasks = useMemo(() => {
    if (!project?.tasks?.length) {
      return [];
    }

    const query = searchText.trim().toLowerCase();
    return project.tasks.filter((task) => {
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query);
      const matchesStatus = statusFilter === "ALL" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "ALL" || task.priority === priorityFilter;
      const matchesAssignee = assigneeFilter === "ALL" || task.assignee.id === assigneeFilter;
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
    });
  }, [assigneeFilter, priorityFilter, project, searchText, statusFilter]);

  const tasksByStatus = useMemo(() => {
    const grouped = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };
    filteredTasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    return grouped;
  }, [filteredTasks]);

  const canUpdateTaskStatus = useCallback(
    (task) => isAdmin || task.assignee.id === user?.id,
    [isAdmin, user?.id]
  );

  const refreshProjectData = useCallback(async () => {
    await Promise.all([loadProject(), loadActivity()]);
  }, [loadActivity, loadProject]);

  const addMember = async (event) => {
    event.preventDefault();
    if (!memberUserId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(`/projects/${projectId}/members`, { userId: memberUserId });
      setMemberUserId("");
      await refreshProjectData();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to add member");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (targetUserId) => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/projects/${projectId}/members/${targetUserId}`);
      await refreshProjectData();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to remove member");
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (taskForm.startDate && taskForm.dueDate && dayjs(taskForm.dueDate).isBefore(dayjs(taskForm.startDate), "day")) {
      setError("Due date must be on or after start date.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await api.post(`/projects/${projectId}/tasks`, {
        ...taskForm,
        startDate: taskForm.startDate || undefined,
        dueDate: taskForm.dueDate || undefined,
      });
      setTaskForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        startDate: "",
        dueDate: "",
      }));
      await refreshProjectData();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to create task");
    } finally {
      setBusy(false);
    }
  };

  const updateTaskStatus = async (taskId, status) => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/tasks/${taskId}`, { status });
      await refreshProjectData();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to update task status");
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async (taskId, file) => {
    if (!file) {
      return;
    }

    setAttachmentsBusyFor((prev) => ({ ...prev, [taskId]: true }));
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/tasks/${taskId}/attachments`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshProjectData();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to upload attachment");
    } finally {
      setAttachmentsBusyFor((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const removeAttachment = async (taskId, attachmentId) => {
    setAttachmentsBusyFor((prev) => ({ ...prev, [taskId]: true }));
    setError("");

    try {
      await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
      await refreshProjectData();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to remove attachment");
    } finally {
      setAttachmentsBusyFor((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const onTaskDragStart = (event, task) => {
    if (!canUpdateTaskStatus(task)) {
      event.preventDefault();
      return;
    }
    setDragTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  };

  const onColumnDrop = async (event, status) => {
    event.preventDefault();
    const droppedTaskId = event.dataTransfer.getData("text/plain") || dragTaskId;
    setDragTaskId("");

    if (!droppedTaskId || !project?.tasks?.length) {
      return;
    }

    const targetTask = project.tasks.find((task) => task.id === droppedTaskId);
    if (!targetTask || targetTask.status === status || !canUpdateTaskStatus(targetTask)) {
      return;
    }

    await updateTaskStatus(droppedTaskId, status);
  };

  if (loading) {
    return <div className="state-box">Loading project...</div>;
  }

  if (error && !project) {
    return (
      <div className="state-box">
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/projects")}>
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <section className="stack">
      <header className="title-row">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">{project.description || "No project description."}</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => navigate("/projects")}>
          Back
        </button>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="card-grid">
        <article className="stat-card">
          <h3>Members</h3>
          <strong>{project.members.length}</strong>
        </article>
        <article className="stat-card">
          <h3>Tasks</h3>
          <strong>{project.tasks.length}</strong>
        </article>
        <article className="stat-card">
          <h3>Filtered Tasks</h3>
          <strong>{filteredTasks.length}</strong>
        </article>
      </div>

      <article className="panel">
        <h2>Team Members</h2>
        <div className="members-wrap">
          {project.members.map((member) => (
            <div key={member.id} className="member-card">
              <p>
                {member.user.name} ({member.user.role})
              </p>
              <p className="muted">{member.user.email}</p>
              {isAdmin && project.owner.id !== member.userId ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => removeMember(member.userId)}
                  disabled={busy}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {isAdmin ? (
          <form className="inline-form" onSubmit={addMember}>
            <select value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>
              <option value="">Select user to add</option>
              {availableUsers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.email})
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={!memberUserId || busy}>
              Add Member
            </button>
          </form>
        ) : null}
      </article>

      {isAdmin ? (
        <form className="panel form-grid task-form-grid" onSubmit={createTask}>
          <h2>Create Task</h2>
          <label className="full-span">
            Title
            <input
              type="text"
              value={taskForm.title}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
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
            Assignee
            <select
              value={taskForm.assigneeId}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, assigneeId: event.target.value }))}
              required
            >
              {project.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={taskForm.priority}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value }))}
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
              onChange={(event) => setTaskForm((prev) => ({ ...prev, startDate: event.target.value }))}
            />
          </label>
          <label>
            Due Date
            <input
              type="date"
              value={taskForm.dueDate}
              min={taskForm.startDate || undefined}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Create Task"}
          </button>
        </form>
      ) : null}

      <article className="panel">
        <h2>Search & Filter Tasks</h2>
        <div className="task-filter-grid">
          <label>
            Search
            <input
              type="text"
              value={searchText}
              placeholder="Search title or description"
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>
          </label>
          <label>
            Priority
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label>
            Assignee
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
              <option value="ALL">All</option>
              {project.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="panel">
        <h2>Kanban Board</h2>
        <p className="muted">
          Drag tasks across columns to update status. Members can move only their own tasks.
        </p>
        <div className="kanban-grid">
          {statusColumns.map((column) => (
            <section
              key={column.key}
              className="kanban-column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onColumnDrop(event, column.key)}
            >
              <header className="kanban-column-header">
                <h3>{column.label}</h3>
                <span>{tasksByStatus[column.key].length}</span>
              </header>

              <div className="kanban-task-list">
                {tasksByStatus[column.key].map((task) => {
                  const canMove = canUpdateTaskStatus(task);
                  const attachmentBusy = Boolean(attachmentsBusyFor[task.id]);
                  return (
                    <article
                      key={task.id}
                      className={`kanban-card${canMove ? "" : " is-disabled"}`}
                      draggable={canMove}
                      onDragStart={(event) => onTaskDragStart(event, task)}
                    >
                      <div className="kanban-card-header">
                        <strong>{task.title}</strong>
                        <span className="tag">{task.priority}</span>
                      </div>
                      <p className="muted">{task.description || "No description."}</p>
                      <div className="kanban-meta">
                        <span>Assignee: {task.assignee.name}</span>
                        <span>Start: {task.startDate ? dayjs(task.startDate).format("DD MMM YYYY") : "-"}</span>
                        <span>Due: {task.dueDate ? dayjs(task.dueDate).format("DD MMM YYYY") : "-"}</span>
                      </div>

                      <div className="attachment-box">
                        <p className="muted">Attachments</p>
                        {task.attachments?.length ? (
                          <ul className="attachment-list">
                            {task.attachments.map((attachment) => (
                              <li key={attachment.id}>
                                <a href={resolveAttachmentUrl(attachment.fileUrl)} target="_blank" rel="noreferrer">
                                  {attachment.fileName}
                                </a>
                                {(isAdmin || task.assignee.id === user?.id || attachment.uploadedById === user?.id) ? (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-xs"
                                    onClick={() => removeAttachment(task.id, attachment.id)}
                                    disabled={attachmentBusy}
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">No files</p>
                        )}
                        <label className="btn btn-outline btn-xs file-btn">
                          {attachmentBusy ? "Uploading..." : "Add File"}
                          <input
                            type="file"
                            hidden
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              uploadAttachment(task.id, file);
                              event.target.value = "";
                            }}
                            disabled={attachmentBusy}
                          />
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </article>

      <article className="panel">
        <h2>Activity Log</h2>
        {activity.length ? (
          <ul className="activity-list">
            {activity.map((entry) => (
              <li key={entry.id}>
                <div className="activity-head">
                  <strong>{entry.actor?.name || "User"}</strong>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
                <p>{entry.message}</p>
                {entry.fieldChanges?.length ? (
                  <div className="activity-change-grid">
                    {entry.fieldChanges.map((change) => (
                      <span key={change.id || `${change.field}-${change.to}`}>
                        {change.field}: {change.from || "empty"} {" -> "} {change.to || "empty"}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No activity yet.</p>
        )}
      </article>
    </section>
  );
};

export default ProjectDetailsPage;

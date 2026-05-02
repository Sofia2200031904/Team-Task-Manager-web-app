import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const ProjectsPage = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const canCreateProject = user?.role === "ADMIN";

  const stats = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.tasks += project.counts.tasks;
        acc.members += project.counts.members;
        return acc;
      },
      { tasks: 0, members: 0 }
    );
  }, [projects]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/projects");
      setProjects(data.projects || []);
      setError("");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const onCreateProject = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError("");

    try {
      await api.post("/projects", form);
      setForm({ name: "", description: "" });
      await loadProjects();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to create project");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="state-box">Loading projects...</div>;
  }

  return (
    <section className="stack">
      <h1>Projects</h1>
      <div className="card-grid">
        <article className="stat-card">
          <h3>Total Projects</h3>
          <strong>{projects.length}</strong>
        </article>
        <article className="stat-card">
          <h3>Total Tasks</h3>
          <strong>{stats.tasks}</strong>
        </article>
        <article className="stat-card">
          <h3>Total Members</h3>
          <strong>{stats.members}</strong>
        </article>
      </div>

      {canCreateProject ? (
        <form className="panel form-grid" onSubmit={onCreateProject}>
          <h2>Create Project</h2>
          <label>
            Project Name
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Creating..." : "Create Project"}
          </button>
        </form>
      ) : null}

      {error ? <div className="error-box">{error}</div> : null}

      <div className="project-grid">
        {projects.map((project) => (
          <article key={project.id} className="project-card">
            <h3>{project.name}</h3>
            <p>{project.description || "No description added."}</p>
            <div className="project-meta">
              <span>Owner: {project.owner.name}</span>
              <span>Members: {project.counts.members}</span>
              <span>Tasks: {project.counts.tasks}</span>
            </div>
            <Link to={`/projects/${project.id}`} className="btn btn-outline">
              Open Project
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
};

export default ProjectsPage;

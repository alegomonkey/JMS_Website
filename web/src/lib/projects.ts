import data from "../data/projects.json";

export interface Project {
  slug: string;
  name: string;
  overview: string;
  contributions: string;
  documentation: string;
  repoUrl: string;
  tags: string[];
}

const projects: Project[] = data as Project[];

export function listProjects(): Project[] {
  return projects;
}

export function findProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function listAllTags(): string[] {
  const set = new Set<string>();
  for (const p of projects) for (const t of p.tags) set.add(t);
  return Array.from(set).sort();
}

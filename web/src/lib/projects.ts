import data from "../data/projects.json";

export interface Project {
  slug: string;
  name: string;
  description: string;
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

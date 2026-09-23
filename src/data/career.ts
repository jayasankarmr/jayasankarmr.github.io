// Career + education, newest first. TODO(Jay): every entry below is a placeholder.
export type CareerEntry = {
  kind: "work" | "education" | "milestone";
  title: string;
  org: string;
  start: string; // "2024-07"
  end?: string; // omit = present
  place?: string;
  summary: string;
  tags?: string[];
};

export const career: CareerEntry[] = [
  {
    kind: "work",
    title: "Software Engineer",
    org: "Company Name",
    start: "2025-07",
    place: "Bengaluru, India",
    summary: "Placeholder — what you own, what you shipped, and the one result you're proudest of.",
    tags: ["Python", "AWS", "TypeScript"],
  },
  {
    kind: "milestone",
    title: "Shipped warm-pool-governor",
    org: "Open source",
    start: "2025-03",
    summary: "A deterministic controller that sizes an EC2 Auto Scaling warm pool.",
    tags: ["Python", "EC2"],
  },
  {
    kind: "work",
    title: "Engineering Intern",
    org: "Company Name",
    start: "2024-05",
    end: "2024-08",
    place: "New Delhi, India",
    summary: "Placeholder — the team, the problem, what changed because you were there.",
    tags: ["Data", "Dashboards"],
  },
  {
    kind: "education",
    title: "B.Tech, Computer Science",
    org: "University Name",
    start: "2021-08",
    end: "2025-06",
    place: "India",
    summary: "Placeholder — focus areas, a society you ran, a project you'd mention first.",
  },
];

export const skills = {
  Languages: ["Python", "TypeScript", "JavaScript", "SQL"],
  Cloud: ["AWS", "GCP", "EC2 Auto Scaling"],
  Craft: ["System design", "Data analysis", "Front-end motion"],
  Tools: ["Git", "Docker", "Jupyter", "Linux"],
}; // TODO(Jay)

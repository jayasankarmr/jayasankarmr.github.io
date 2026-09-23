// Projects: curated repo names, enriched at build time from the GitHub API.
// If the API is unreachable (offline dev, rate limit) the fallback text is used,
// so the build never fails on the network.
const USER = "jayasankarmr";

// Order = display order. `blurb` overrides an empty or dull repo description.
const featured: { repo: string; blurb?: string; tags?: string[] }[] = [
  { repo: "warm-pool-governor", tags: ["Python", "AWS"] },
  { repo: "Downright", tags: ["JavaScript", "Extension"] },
  { repo: "credit-risk-analyser", blurb: "Credit-risk modelling and analysis notebook.", tags: ["ML", "Python"] },
  { repo: "job-market-analyzer", blurb: "Analysing the shape of the job market from listings data.", tags: ["Data", "Python"] },
  { repo: "HR-Workflow-Designer", blurb: "Visual designer for HR workflows.", tags: ["TypeScript"] },
  { repo: "alumniconnect", blurb: "A platform connecting students with alumni.", tags: ["TypeScript"] },
  { repo: "sihcivic", blurb: "Civic-tech build for Smart India Hackathon.", tags: ["TypeScript"] },
  { repo: "LifeDrop", tags: ["HTML", "DBMS"] },
];

export type Project = {
  name: string;
  description: string;
  url: string;
  homepage?: string;
  language?: string;
  stars: number;
  updated?: string;
  tags: string[];
};

type Repo = {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
};

let cache: Project[] | undefined;

export async function getProjects(): Promise<Project[]> {
  if (cache) return cache;
  let repos: Repo[] = [];
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) repos = await res.json();
  } catch {
    /* offline — fall through to curated text */
  }
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  cache = featured.map(({ repo, blurb, tags = [] }) => {
    const r = byName.get(repo.toLowerCase());
    return {
      name: repo,
      description: r?.description || blurb || "",
      url: r?.html_url ?? `https://github.com/${USER}/${repo}`,
      homepage: r?.homepage || undefined,
      language: r?.language ?? undefined,
      stars: r?.stargazers_count ?? 0,
      updated: r?.pushed_at,
      tags,
    };
  });
  return cache;
}

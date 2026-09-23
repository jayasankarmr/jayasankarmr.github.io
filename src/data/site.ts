// Identity + links, shared by every page. Anything marked TODO(Jay) is a placeholder.
export const site = {
  name: "Jayasankar M R",
  short: "Jay",
  role: "Engineer & photographer", // TODO(Jay): your one-line title
  location: "Kerala, India",
  timezone: "Asia/Kolkata",
  email: "jayasankar.mr7@gmail.com",
  intro:
    "I build dependable software and chase honest light. This is everything in one place — the work, the code, the frames, and the roads in between.", // TODO(Jay)
  // the career page is engineering-only; photography lives on its own page
  careerRole: "Software engineer", // TODO(Jay)
  careerIntro:
    "I build dependable software — control loops, autoscaling, data pipelines, and the interfaces on top. Things that behave the same way twice.", // TODO(Jay)
};

export const socials = [
  { id: "github", label: "GitHub", handle: "@jayasankarmr", href: "https://github.com/jayasankarmr" },
  { id: "linkedin", label: "LinkedIn", handle: "in/jayasankarmr", href: "https://www.linkedin.com/in/jayasankarmr/" }, // TODO(Jay): confirm URL
  { id: "instagram", label: "Instagram", handle: "@jayasankar.mr", href: "https://www.instagram.com/jayasankar.mr/" },
] as const;

// The three pages, in menu order. Shared header + footer (src/components/) render from this;
// public/photography/index.html mirrors the same markup by hand.
export const pages = [
  { id: "home", label: "Journey", href: "/" },
  { id: "career", label: "Career", href: "/career/" },
  { id: "photography", label: "Photography", href: "/photography/" },
] as const;
export type PageId = (typeof pages)[number]["id"];

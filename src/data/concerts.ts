// Shows attended, oldest first. Rendered as ticket stubs on the home page.
export type Concert = {
  artist: string;
  /** city or state the show was in */
  city: string;
  /** festival or venue, when it's worth naming */
  event?: string;
  /** "2025-04-21" or "2025-04" */
  when: string;
  /** a path under /photography/images once a frame is picked */
  photo?: string;
  /** venue for the back of the ticket; the back falls back to `event`, then `city` */
  venue?: string;
  /** one line for the back of the ticket (who you went with, the song that did it) */
  note?: string;
};

export const concerts: Concert[] = [
  { artist: "Anirudh Ravichander", city: "Kerala", when: "2023-06" },
  { artist: "Brooks", city: "New Delhi", event: "DTU Engifest", when: "2024-02" },
  { artist: "Diljit Dosanjh", city: "Bengaluru", when: "2024-12" },
  { artist: "Darshan Raval", city: "New Delhi", event: "NSUT", when: "2025-04-21" },
  { artist: "Travis Scott", city: "New Delhi", when: "2025-10" },
];

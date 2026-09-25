// Places on the map, in the order the story visits them (oldest first after home).
// The home-page globe, its route and the travel timeline all render from this array.
export type Place = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  note: string;
  /** "2024-01" or "2024" — shown on the timeline; omit if unknown */
  when?: string;
  /** a place visited again and again from `when` on, not a single trip */
  recurring?: boolean;
  /** a path under /photography/images when a frame exists for the place */
  photo?: string;
  /** Google Photos shared-album or Instagram post URL for the trip */
  link?: string;
  home?: boolean;
  /** reached overland from the previous stop on the same trip — drawn as a low ground leg, not a new flight */
  leg?: boolean;
  /** stand-in stop until real trip data is imported; rendered dimmed and marked TBA */
  placeholder?: boolean;
  /** how this stop was reached: shown as the transport line on the boarding pass ("By train").
   *  Omit when unknown: the pass shows "Overland" for `leg` stops, otherwise nothing. */
  mode?: "flight" | "train" | "road" | "bus" | "ferry";
  /** alt text for `photo`; defaults to "Photograph from {name}" */
  photoAlt?: string;
  /** CSS object-position for `photo` where a pass crops it tighter than its 3:2 frame (the compact
   *  deck shows 16:7); defaults to centre. The WebGL reveal reads the same value. */
  photoPosition?: string;
  /** "2024-12-26": last day of a multi-day visit; the pass shows "Dec 2024 – 26 Dec 2024" */
  until?: string;
  /** how many times a recurring stop has been visited; the pass adds "· 6 visits" to "on repeat" */
  visits?: number;
};

// Photos are 3:2 crops in /photography/images/travel/, framed on each shot's subject.
// TODO(Jay): add a `link` per stop as trip albums are picked.
export const places: Place[] = [
  { id: "thrissur", name: "Thrissur", region: "Kerala", lat: 10.53, lng: 76.21, note: "Born here. Every route on this map starts in Kerala.", home: true, photo: "/photography/images/travel/thrissur.jpg", photoAlt: "Athirappilly Falls pouring off the rocks into the Chalakudy river, forested hills behind" },
  { id: "goa", name: "Goa", region: "West coast", lat: 15.49, lng: 73.83, note: "A May trip to the coast, the summer before college.", when: "2023-05", photo: "/photography/images/travel/goa.jpg", photoAlt: "A street in Fontainhas, Panaji, lined with red, yellow and blue Portuguese-era houses" },
  { id: "srm", name: "SRM IST", region: "Delhi NCR", lat: 28.8, lng: 77.54, note: "Moved north for a B.Tech — the base camp for most of what follows.", when: "2023-08" },
  { id: "delhi", name: "New Delhi", region: "Delhi", lat: 28.61, lng: 77.21, note: "The stop I keep coming back to — concerts, sightseeing, the Red Line at dusk.", when: "2023-08", recurring: true, leg: true, photo: "/photography/images/travel/delhi.jpg", photoAlt: "The red sandstone gateway of Jama Masjid above a crowd on its steps", photoPosition: "50% 35%" },
  { id: "alappuzha", name: "Alappuzha", region: "Kerala", lat: 9.5, lng: 76.34, note: "Back south for the backwaters.", when: "2023-10", photo: "/photography/images/travel/alappuzha.jpg", photoAlt: "The prow of a wooden canoe on a green backwater channel under coconut palms" },
  { id: "dehradun", name: "Dehradun & Mussoorie", region: "Uttarakhand", lat: 30.4, lng: 78.05, note: "Up into the hills for December.", when: "2023-12", photo: "/photography/images/travel/dehradun.jpg", photoAlt: "A bowl of Maggi held up among prayer flags, with the hills around Mussoorie behind" },
  { id: "bengaluru", name: "Bengaluru", region: "Karnataka", lat: 12.97, lng: 77.59, note: "First visit in March 2024, and back many times over the degree.", when: "2024-03", recurring: true, photo: "/photography/images/travel/bengaluru.jpg", photoAlt: "An orange sunset under heavy clouds over the airport apron and parked planes" },
  { id: "lucknow", name: "Lucknow", region: "Uttar Pradesh", lat: 26.85, lng: 80.95, note: "The city of nawabs, in May.", when: "2024-05", photo: "/photography/images/travel/lucknow.jpg", photoAlt: "The arched facade of the Bara Imambara gateway and its stairs", photoPosition: "50% 45%" },
  { id: "kodaikanal", name: "Kodaikanal", region: "Tamil Nadu", lat: 10.24, lng: 77.49, note: "Into the Palani Hills in June.", when: "2024-06", photo: "/photography/images/travel/kodaikanal.jpg", photoAlt: "A can of Coke held up against mist rolling over the Palani Hills" },
  { id: "jaipur", name: "Jaipur", region: "Rajasthan", lat: 26.91, lng: 75.79, note: "The Pink City in October.", when: "2024-10", photo: "/photography/images/travel/jaipur.jpg", photoAlt: "Painted floral arches nested one inside another at Patrika Gate" },
  { id: "phuket", name: "Phuket", region: "Thailand", lat: 7.88, lng: 98.39, note: "First leg of ten days in Thailand — the Andaman coast, 20–23 December.", when: "2024-12", photo: "/photography/images/travel/phuket.jpg", photoAlt: "Jay crouched beside a resting tiger", photoPosition: "50% 25%" },
  { id: "pattaya", name: "Pattaya", region: "Thailand", lat: 12.93, lng: 100.88, note: "Across to the Gulf of Thailand, 23–26 December.", when: "2024-12", leg: true, photo: "/photography/images/travel/pattaya.jpg", photoAlt: "Longtail boats pulled up on a beach below a small wooded island" },
  { id: "bangkok", name: "Bangkok", region: "Thailand", lat: 13.76, lng: 100.5, note: "Seeing the year out in the capital, 26–30 December.", when: "2024-12", leg: true, photo: "/photography/images/travel/bangkok.jpg", photoAlt: "Black-and-white portrait of Jay in sunglasses, sipping from a glass at night", photoPosition: "50% 40%" },
  { id: "prayagraj", name: "Prayagraj", region: "Uttar Pradesh", lat: 25.43, lng: 81.88, note: "The Maha Kumbh at the Triveni Sangam.", when: "2025-02", photo: "/photography/images/travel/prayagraj.jpg", photoAlt: "Crowds filling the Maha Kumbh grounds under loudspeaker poles, titled “Mahakumbh”", photoPosition: "50% 0%" },
  { id: "varanasi", name: "Varanasi", region: "Uttar Pradesh", lat: 25.32, lng: 83.01, note: "The ghats along the Ganga, a month after the Kumbh.", when: "2025-03", photo: "/photography/images/travel/varanasi.jpg", photoAlt: "A clay cup of malaiyo topped with saffron, almonds and pistachio" },
  { id: "mumbai", name: "Mumbai", region: "Maharashtra", lat: 19.08, lng: 72.88, note: "April in the city by the sea.", when: "2025-04", photo: "/photography/images/travel/mumbai.jpg", photoAlt: "The domed Gothic tower of the BMC building rising above palm trees", photoPosition: "50% 35%" },
  { id: "udaipur", name: "Udaipur", region: "Rajasthan", lat: 24.58, lng: 73.68, note: "Palace domes, and a peacock hiding on Machla Magra Hill.", when: "2025-10", photo: "/photography/images/travel/udaipur.jpg", photoAlt: "Black-and-white view of a lotus-topped chhatri on the City Palace", photoPosition: "50% 20%" },
  { id: "hyderabad", name: "Hyderabad", region: "Telangana", lat: 17.39, lng: 78.49, note: "December in the city of pearls.", when: "2025-12", photo: "/photography/images/travel/hyderabad.jpg", photoAlt: "Jay in front of the arches of a Qutb Shahi tomb", photoPosition: "50% 75%" },
  { id: "varkala", name: "Varkala", region: "Kerala", lat: 8.74, lng: 76.72, note: "Home again — cliffs over the Arabian Sea.", when: "2026-06", photo: "/photography/images/travel/varkala.jpg", photoAlt: "Jay seen from behind, looking out over the Arabian Sea", photoPosition: "50% 5%" },
];

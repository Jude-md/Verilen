import fs from "fs";
import path from "path";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { publicProfiles, type SocialPlatform } from "@/db/schema";
import { extractVisualSignature, type ExtractedImageSignature } from "@/lib/vision";

interface SeedProfileSpec {
  identityKey: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  profileUrl: string;
  avatarFile: string;
  bio: string;
  location: string;
  followersCount: number;
  verified: boolean;
}

const SEED_PROFILES: SeedProfileSpec[] = [
  // Elena Vance — 4 platforms (editorial photographer & creative director)
  {
    identityKey: "elena-vance",
    platform: "instagram",
    handle: "@elena.vance",
    displayName: "Elena Vance",
    profileUrl: "https://www.instagram.com/elena.vance",
    avatarFile: "elena-vance.jpg",
    bio: "Editorial portrait photographer & alpine traveler. Capturing winter light on 35mm film.",
    location: "Zurich, Switzerland",
    followersCount: 148200,
    verified: true,
  },
  {
    identityKey: "elena-vance",
    platform: "x",
    handle: "@elenavance",
    displayName: "Elena Vance",
    profileUrl: "https://x.com/elenavance",
    avatarFile: "elena-vance-alt.jpg",
    bio: "Visual director at Studio Nord. Notes on color grading, light, and documentary work.",
    location: "Zurich, Switzerland",
    followersCount: 41600,
    verified: true,
  },
  {
    identityKey: "elena-vance",
    platform: "linkedin",
    handle: "in/elena-vance",
    displayName: "Elena Vance",
    profileUrl: "https://www.linkedin.com/in/elena-vance",
    avatarFile: "elena-vance.jpg",
    bio: "Creative Director at Studio Nord | Brand Photography & Print Campaigns",
    location: "Zurich, Switzerland",
    followersCount: 19400,
    verified: false,
  },
  {
    identityKey: "elena-vance",
    platform: "youtube",
    handle: "@ElenaVanceStudio",
    displayName: "Elena Vance",
    profileUrl: "https://www.youtube.com/@ElenaVanceStudio",
    avatarFile: "elena-vance-alt.jpg",
    bio: "Behind-the-scenes location shoots, lens reviews, and natural-light color tutorials.",
    location: "Zurich, Switzerland",
    followersCount: 92500,
    verified: true,
  },

  // Marcus Cole — 4 platforms (staff design engineer & founder)
  {
    identityKey: "marcus-cole",
    platform: "github",
    handle: "@marcuscole",
    displayName: "Marcus Cole",
    profileUrl: "https://github.com/marcuscole",
    avatarFile: "marcus-cole.jpg",
    bio: "Building open-source graphics tools, TypeScript compilers & shader pipelines.",
    location: "Seattle, WA",
    followersCount: 14800,
    verified: true,
  },
  {
    identityKey: "marcus-cole",
    platform: "x",
    handle: "@marcuscole_dev",
    displayName: "Marcus Cole",
    profileUrl: "https://x.com/marcuscole_dev",
    avatarFile: "marcus-cole-alt.jpg",
    bio: "Co-founder @Framekit. Obsessed with fast interfaces and local-first software.",
    location: "Seattle, WA",
    followersCount: 63900,
    verified: true,
  },
  {
    identityKey: "marcus-cole",
    platform: "linkedin",
    handle: "in/marcus-cole",
    displayName: "Marcus Cole",
    profileUrl: "https://www.linkedin.com/in/marcus-cole",
    avatarFile: "marcus-cole.jpg",
    bio: "Co-Founder & CTO at Framekit | Formerly Staff Design Engineer",
    location: "Seattle, WA",
    followersCount: 28100,
    verified: true,
  },
  {
    identityKey: "marcus-cole",
    platform: "instagram",
    handle: "@marcus.frames",
    displayName: "Marcus Cole",
    profileUrl: "https://www.instagram.com/marcus.frames",
    avatarFile: "marcus-cole-alt.jpg",
    bio: "Coffee, Pacific Northwest hikes, architecture & mechanical keyboards.",
    location: "Seattle, WA",
    followersCount: 11200,
    verified: false,
  },

  // Amara Okafor — 4 platforms (product designer & ceramic artist)
  {
    identityKey: "amara-okafor",
    platform: "instagram",
    handle: "@amaraokafor",
    displayName: "Amara Okafor",
    profileUrl: "https://www.instagram.com/amaraokafor",
    avatarFile: "amara-okafor.jpg",
    bio: "Design lead & slow-living creator. Minimal spaces, skincare & studio ceramics.",
    location: "London, UK",
    followersCount: 234000,
    verified: true,
  },
  {
    identityKey: "amara-okafor",
    platform: "tiktok",
    handle: "@amara.creates",
    displayName: "Amara Okafor",
    profileUrl: "https://www.tiktok.com/@amara.creates",
    avatarFile: "amara-okafor-alt.jpg",
    bio: "London studio diaries, brand design tips & daily visual rituals.",
    location: "London, UK",
    followersCount: 389000,
    verified: true,
  },
  {
    identityKey: "amara-okafor",
    platform: "linkedin",
    handle: "in/amara-okafor",
    displayName: "Amara Okafor",
    profileUrl: "https://www.linkedin.com/in/amara-okafor",
    avatarFile: "amara-okafor.jpg",
    bio: "Principal Brand Designer at Atelier K | Speaker & Creative Advisor",
    location: "London, UK",
    followersCount: 34200,
    verified: true,
  },
  {
    identityKey: "amara-okafor",
    platform: "youtube",
    handle: "@AmaraOkafor",
    displayName: "Amara Okafor",
    profileUrl: "https://www.youtube.com/@AmaraOkafor",
    avatarFile: "amara-okafor-alt.jpg",
    bio: "Weekly vlogs on independent design practice, craft, and intentional studios.",
    location: "London, UK",
    followersCount: 118000,
    verified: true,
  },

  // Liam Harper — 3 platforms (architect & industrial film director)
  {
    identityKey: "liam-harper",
    platform: "linkedin",
    handle: "in/liam-harper",
    displayName: "Liam Harper",
    profileUrl: "https://www.linkedin.com/in/liam-harper",
    avatarFile: "liam-harper.jpg",
    bio: "Managing Partner at Northlight Ventures | Investing in design-led AI teams.",
    location: "New York, NY",
    followersCount: 52700,
    verified: true,
  },
  {
    identityKey: "liam-harper",
    platform: "x",
    handle: "@liamharper",
    displayName: "Liam Harper",
    profileUrl: "https://x.com/liamharper",
    avatarFile: "liam-harper-alt.jpg",
    bio: "Partner @NorthlightVC. Writing weekly essays on consumer software & architecture.",
    location: "New York, NY",
    followersCount: 84300,
    verified: true,
  },
  {
    identityKey: "liam-harper",
    platform: "instagram",
    handle: "@liam.harper",
    displayName: "Liam Harper",
    profileUrl: "https://www.instagram.com/liam.harper",
    avatarFile: "liam-harper.jpg",
    bio: "NYC architecture, classical tailoring & film frames.",
    location: "New York, NY",
    followersCount: 29400,
    verified: false,
  },

  // Sophia Chen — 3 platforms (climate researcher & travel essayist)
  {
    identityKey: "sophia-chen",
    platform: "instagram",
    handle: "@sophiachen.studio",
    displayName: "Sophia Chen",
    profileUrl: "https://www.instagram.com/sophiachen.studio",
    avatarFile: "sophia-chen.jpg",
    bio: "Architectural stylist & independent magazine contributor in San Francisco.",
    location: "San Francisco, CA",
    followersCount: 96400,
    verified: true,
  },
  {
    identityKey: "sophia-chen",
    platform: "tiktok",
    handle: "@sophia.visuals",
    displayName: "Sophia Chen",
    profileUrl: "https://www.tiktok.com/@sophia.visuals",
    avatarFile: "sophia-chen-alt.jpg",
    bio: "Minimal wardrobe edits, golden hour walks & Bay Area design shops.",
    location: "San Francisco, CA",
    followersCount: 164000,
    verified: false,
  },
  {
    identityKey: "sophia-chen",
    platform: "github",
    handle: "@sophiachen-ux",
    displayName: "Sophia Chen",
    profileUrl: "https://github.com/sophiachen-ux",
    avatarFile: "sophia-chen.jpg",
    bio: "Design systems architect working with typography tokens and CSS craft.",
    location: "San Francisco, CA",
    followersCount: 4100,
    verified: false,
  },

  // Clara Solis — 2 platforms (fashion editor & stylist)
  {
    identityKey: "clara-solis",
    platform: "instagram",
    handle: "@clarasolis",
    displayName: "Clara Solis",
    profileUrl: "https://www.instagram.com/clarasolis",
    avatarFile: "clara-solis.jpg",
    bio: "Contributing Fashion Editor. Madrid & Paris seasonal lookbooks.",
    location: "Madrid, Spain",
    followersCount: 312000,
    verified: true,
  },
  {
    identityKey: "clara-solis",
    platform: "x",
    handle: "@clarasolis_ed",
    displayName: "Clara Solis",
    profileUrl: "https://x.com/clarasolis_ed",
    avatarFile: "clara-solis-alt.jpg",
    bio: "Culture notes, runway photography & European print design.",
    location: "Madrid, Spain",
    followersCount: 47800,
    verified: true,
  },

  // Maya Alvarez — 2 platforms (short-form creator & illustrator)
  {
    identityKey: "maya-alvarez",
    platform: "tiktok",
    handle: "@mayaalvarez",
    displayName: "Maya Alvarez",
    profileUrl: "https://www.tiktok.com/@mayaalvarez",
    avatarFile: "maya-alvarez.jpg",
    bio: "Color-first illustrator, muralist & sketchbook storyteller in Lisbon.",
    location: "Lisbon, Portugal",
    followersCount: 425000,
    verified: true,
  },
  {
    identityKey: "maya-alvarez",
    platform: "youtube",
    handle: "@MayaDraws",
    displayName: "Maya Alvarez",
    profileUrl: "https://www.youtube.com/@MayaDraws",
    avatarFile: "maya-alvarez-alt.jpg",
    bio: "Studio tours, vibrant gouache painting process, and art supply breakdowns.",
    location: "Lisbon, Portugal",
    followersCount: 156000,
    verified: true,
  },

  // Mateo Silva — 2 platforms (film composer & audio designer)
  {
    identityKey: "mateo-silva",
    platform: "youtube",
    handle: "@MateoSilvaSound",
    displayName: "Mateo Silva",
    profileUrl: "https://www.youtube.com/@MateoSilvaSound",
    avatarFile: "mateo-silva.jpg",
    bio: "Analog synths, acoustic film scores, and sound design breakdowns.",
    location: "Austin, TX",
    followersCount: 83400,
    verified: false,
  },
  {
    identityKey: "mateo-silva",
    platform: "instagram",
    handle: "@mateosilva.audio",
    displayName: "Mateo Silva",
    profileUrl: "https://www.instagram.com/mateosilva.audio",
    avatarFile: "mateo-silva-alt.jpg",
    bio: "Composer & modular synth enthusiast. Sunlight and tape echoes.",
    location: "Austin, TX",
    followersCount: 38900,
    verified: false,
  },

  // Diverse individual cross-network profiles (10 more distinct faces)
  {
    identityKey: "daniel-reid",
    platform: "github",
    handle: "@danielreid",
    displayName: "Daniel Reid",
    profileUrl: "https://github.com/danielreid",
    avatarFile: "daniel-reid.jpg",
    bio: "Rust systems engineer & distributed databases maintainer.",
    location: "Toronto, Canada",
    followersCount: 9200,
    verified: false,
  },
  {
    identityKey: "nadia-bennett",
    platform: "linkedin",
    handle: "in/nadia-bennett",
    displayName: "Nadia Bennett",
    profileUrl: "https://www.linkedin.com/in/nadia-bennett",
    avatarFile: "nadia-bennett.jpg",
    bio: "VP of Product Marketing at Lattice Cloud | Tech Advisor & Podcast Host",
    location: "Chicago, IL",
    followersCount: 41200,
    verified: true,
  },
  {
    identityKey: "diego-morales",
    platform: "linkedin",
    handle: "in/diego-morales",
    displayName: "Diego Morales",
    profileUrl: "https://www.linkedin.com/in/diego-morales",
    avatarFile: "diego-morales.jpg",
    bio: "Fintech Strategist & Economist | Board Observer at MercadoPay",
    location: "Mexico City, Mexico",
    followersCount: 31500,
    verified: true,
  },
  {
    identityKey: "claire-dubois",
    platform: "x",
    handle: "@clairedubois",
    displayName: "Claire Dubois",
    profileUrl: "https://x.com/clairedubois",
    avatarFile: "claire-dubois.jpg",
    bio: "Tech journalist covering European AI regulation and consumer privacy.",
    location: "Paris, France",
    followersCount: 74600,
    verified: true,
  },
  {
    identityKey: "hannah-park",
    platform: "instagram",
    handle: "@hannahpark.co",
    displayName: "Hannah Park",
    profileUrl: "https://www.instagram.com/hannahpark.co",
    avatarFile: "hannah-park.jpg",
    bio: "Editorial portrait photographer & coffee roaster based in Vancouver.",
    location: "Vancouver, Canada",
    followersCount: 112400,
    verified: true,
  },
  {
    identityKey: "lucas-ferreira",
    platform: "x",
    handle: "@lucasferreira",
    displayName: "Lucas Ferreira",
    profileUrl: "https://x.com/lucasferreira",
    avatarFile: "lucas-ferreira.jpg",
    bio: "Product founder & motorsport journalist. Sao Paulo / Milan.",
    location: "Milan, Italy",
    followersCount: 58300,
    verified: true,
  },
  {
    identityKey: "zara-khalid",
    platform: "tiktok",
    handle: "@zarakhalid",
    displayName: "Zara Khalid",
    profileUrl: "https://www.tiktok.com/@zarakhalid",
    avatarFile: "zara-khalid.jpg",
    bio: "Culinary storyteller, cookbook author & table-setting studio.",
    location: "Dubai, UAE",
    followersCount: 274000,
    verified: true,
  },
  {
    identityKey: "noah-mensah",
    platform: "youtube",
    handle: "@NoahMensahTech",
    displayName: "Noah Mensah",
    profileUrl: "https://www.youtube.com/@NoahMensahTech",
    avatarFile: "noah-mensah.jpg",
    bio: "In-depth camera gear breakdowns, minimal desk tours & founder talks.",
    location: "Berlin, Germany",
    followersCount: 198000,
    verified: true,
  },
  {
    identityKey: "olivia-laurent",
    platform: "instagram",
    handle: "@olivialaurent",
    displayName: "Olivia Laurent",
    profileUrl: "https://www.instagram.com/olivialaurent",
    avatarFile: "olivia-laurent.jpg",
    bio: "Fine art botanist, printmaker & sunlight observer in Lyon.",
    location: "Lyon, France",
    followersCount: 86500,
    verified: false,
  },
  {
    identityKey: "nina-korsak",
    platform: "github",
    handle: "@ninakorsak",
    displayName: "Nina Korsak",
    profileUrl: "https://github.com/ninakorsak",
    avatarFile: "nina-korsak.jpg",
    bio: "Computer vision researcher · Open image indexing & Python ML pipelines.",
    location: "Amsterdam, Netherlands",
    followersCount: 16300,
    verified: true,
  },
];

const globalForSeed = globalThis as typeof globalThis & {
  __veriLensSeedPromise?: Promise<void>;
  __veriLensSeeded?: boolean;
};

async function runSeed(): Promise<void> {
  const [{ total }] = await db.select({ total: count() }).from(publicProfiles);
  if (total > 0) {
    globalForSeed.__veriLensSeeded = true;
    return;
  }

  const profilesDir = path.join(process.cwd(), "public", "profiles");
  const signatureCache = new Map<string, ExtractedImageSignature>();

  const rows = [];
  for (const spec of SEED_PROFILES) {
    let sig = signatureCache.get(spec.avatarFile);
    if (!sig) {
      const filePath = path.join(profilesDir, spec.avatarFile);
      const buffer = await fs.promises.readFile(filePath);
      sig = await extractVisualSignature(buffer);
      signatureCache.set(spec.avatarFile, sig);
    }

    rows.push({
      identityKey: spec.identityKey,
      platform: spec.platform,
      handle: spec.handle,
      displayName: spec.displayName,
      profileUrl: spec.profileUrl,
      avatarPath: `/profiles/${spec.avatarFile}`,
      bio: spec.bio,
      location: spec.location,
      followersCount: spec.followersCount,
      verified: spec.verified,
      isUserAdded: false,
      sha256: sig.sha256,
      dhash: sig.dhash,
      ahash: sig.ahash,
      visualVector: sig.visualVector,
    });
  }

  await db
    .insert(publicProfiles)
    .values(rows)
    .onConflictDoNothing();

  globalForSeed.__veriLensSeeded = true;
}

export async function ensureProfilesSeeded(): Promise<void> {
  if (globalForSeed.__veriLensSeeded) return;
  if (!globalForSeed.__veriLensSeedPromise) {
    globalForSeed.__veriLensSeedPromise = runSeed().catch((err) => {
      globalForSeed.__veriLensSeedPromise = undefined;
      throw err;
    });
  }
  await globalForSeed.__veriLensSeedPromise;
}

import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";
import type { Prisma } from "../src/generated/prisma/client.js";

const SAMPLE_PASSWORD = "ArcherSample2026!";
const CLIENT_COUNT = 24;
const FREELANCER_COUNT = 96;
const JOB_COUNT = 240;
const PROPOSALS_PER_JOB = 3;
const BATCH_SIZE = 60;

const firstNames = ["Aye", "Maya", "Htet", "Nora", "Min", "Thiri", "Evan", "Khin", "Leo", "Su", "Noah", "May", "Aria", "Ko", "Luna", "Zin"];
const lastNames = ["Lin", "Win", "Aung", "Carter", "Reed", "Myo", "Rivera", "Taylor", "Tun", "Wells", "Hayes", "Morgan"];
const locations = ["Yangon, Myanmar", "Mandalay, Myanmar", "Bangkok, Thailand", "Chiang Mai, Thailand", "Kuala Lumpur, Malaysia", "Remote"];
const freelancerSkills = [
  ["Figma", "Brand design", "Illustration"],
  ["React", "TypeScript", "Accessibility"],
  ["Copywriting", "Editing", "SEO"],
  ["Product strategy", "Research", "Prototyping"],
  ["Photography", "Lightroom", "Art direction"],
  ["Social media", "Campaigns", "Analytics"],
  ["Node.js", "API design", "PostgreSQL"],
  ["Motion design", "After Effects", "Storyboarding"],
];
const jobKinds = [
  { title: "Brand identity refresh", skill: "Brand design", description: "We are looking for a thoughtful designer to refine our visual identity for a growing independent business. The work includes a compact logo system, color and type guidance, and a few practical examples for our website and social channels." },
  { title: "Landing page for a new product", skill: "Web design", description: "Help us introduce a new digital product with a clear, welcoming landing page. We have the content outline and product direction; we would love your help shaping the page structure, responsive layouts, and polished handoff." },
  { title: "React dashboard improvements", skill: "React", description: "We need a frontend partner to improve an existing React dashboard. The project includes a handful of responsive screens, thoughtful empty and loading states, and a small set of reusable interface patterns." },
  { title: "Product story and launch copy", skill: "Writing", description: "We are preparing to launch a small product and want a writer to make the story easy to understand. The scope includes a short positioning workshop, homepage copy, and a concise launch announcement." },
  { title: "Customer research interviews", skill: "Research", description: "We want to better understand how small teams organize their project work. Help us plan and conduct remote interviews, summarize recurring needs, and turn the findings into clear product recommendations." },
  { title: "Social campaign creative", skill: "Marketing", description: "Create a compact set of campaign ideas and social assets for a community-focused launch. We have the audience and goals ready and need help making the message feel useful, distinct, and consistent." },
  { title: "Illustration set for learning content", skill: "Illustration", description: "We are refreshing a series of learning materials and need a small family of illustrations. The work includes a visual direction, six illustrations, and source files prepared for web use." },
  { title: "API integration and cleanup", skill: "Node.js", description: "Help us simplify a small Express API and connect a few existing endpoints. We value clear code, careful validation, and a short handoff document that our in-house developer can continue from." },
  { title: "Editorial review for a guide", skill: "Editing", description: "Review a practical guide before publication. We need a careful editor to improve clarity and flow, flag unsupported claims, and keep the writer's friendly voice intact." },
  { title: "Short motion pieces for product demos", skill: "Motion design", description: "Make a few short motion clips that explain key moments in our product. We have screen recordings and a rough storyboard; we are looking for someone to add pacing, titles, and a little visual polish." },
  { title: "Small business photo direction", skill: "Photography", description: "Help us plan a practical photo session for a small retail brand. The project includes a shot list, visual references, and art direction that our local photographer can use on shoot day." },
  { title: "Accessible component review", skill: "Accessibility", description: "Review a set of web interface components for keyboard access, focus visibility, and screen reader clarity. Please provide prioritized findings and examples the product team can implement." },
];
const proposalOpeners = [
  "I have worked on a similar project and would start by clarifying the audience and the main decision this work needs to support.",
  "This sounds like a good fit for my experience. I would first review the current materials, then share an outline so we can agree on direction early.",
  "I enjoy projects where a clear process and close collaboration matter. I can bring a practical first pass and keep the feedback loop focused.",
  "I have a few relevant examples to share and would be glad to talk through your goals before estimating the final scope.",
  "I can help turn the current brief into a small set of clear deliverables, with checkpoints so you can review progress as we go.",
];
const messageBodies = [
  "Thanks for sharing the brief. I have a couple of questions about the audience and what a successful handoff looks like.",
  "Happy to clarify. We are aiming for something easy for our small team to maintain after the first release.",
  "That makes sense. I can put together a short outline with milestones and the information I would need from you.",
  "Great, I will gather the current examples and send them over so we can align on the direction.",
  "Thanks, this gives me a good picture. I will review the details and follow up with a few focused questions.",
  "Sounds good. Let's keep the first pass small, review it together, and refine from there.",
];

function sampleName(index: number) {
  return `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

async function inBatches<T>(items: T[], createOperations: (item: T) => Prisma.PrismaPromise<unknown>[]) {
  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    const batch = items.slice(offset, offset + BATCH_SIZE);
    await prisma.$transaction(batch.flatMap(createOperations));
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 12);
  const clients = Array.from({ length: CLIENT_COUNT }, (_, index) => ({
    id: `seed_client_${String(index + 1).padStart(3, "0")}`,
    email: `seed.client.${String(index + 1).padStart(3, "0")}@archer.example.test`,
    displayName: `${sampleName(index)} Studio`,
    location: locations[index % locations.length]!,
  }));
  const freelancers = Array.from({ length: FREELANCER_COUNT }, (_, index) => ({
    id: `seed_freelancer_${String(index + 1).padStart(3, "0")}`,
    email: `seed.freelancer.${String(index + 1).padStart(3, "0")}@archer.example.test`,
    displayName: sampleName(index + 32),
    location: locations[(index * 5 + 1) % locations.length]!,
    skills: freelancerSkills[index % freelancerSkills.length]!,
  }));
  const demoAdmin = {
    id: "seed_admin_demo",
    email: "demo.admin@archer.example.test",
    role: "ADMIN",
  };
  const sampleUsers = [
    ...clients.map((client) => ({ ...client, role: "CLIENT" })),
    ...freelancers.map((freelancer) => ({ ...freelancer, role: "FREELANCER" })),
    demoAdmin,
  ];

  await inBatches(sampleUsers, (person) => [
    prisma.user.upsert({
      where: { id: person.id },
      create: { id: person.id, email: person.email, passwordHash, role: person.role },
      update: { email: person.email, passwordHash, role: person.role },
    }),
  ]);

  const profiles = [
    ...clients.map((client, index) => ({
      userId: client.id,
      displayName: client.displayName,
      headline: `Building good things in ${client.location.split(",")[0]}`,
      bio: `We are a small team working on thoughtful projects. We value clear communication, practical ideas, and respectful collaboration.`,
      location: client.location,
      skills: [],
      index,
    })),
    ...freelancers.map((freelancer, index) => ({
      userId: freelancer.id,
      displayName: freelancer.displayName,
      headline: `${freelancer.skills[0]} specialist · independent creative`,
      bio: `I help teams move from an early idea to clear, useful work. My process is collaborative, organized, and focused on the people who will use the result.`,
      location: freelancer.location,
      skills: freelancer.skills,
      index: index + CLIENT_COUNT,
    })),
  ];
  for (let offset = 0; offset < profiles.length; offset += BATCH_SIZE) {
    const batch = profiles.slice(offset, offset + BATCH_SIZE);
    await prisma.$transaction(batch.map((profile) => prisma.profile.upsert({
      where: { userId: profile.userId },
      create: {
        userId: profile.userId,
        displayName: profile.displayName,
        headline: profile.headline,
        bio: profile.bio,
        location: profile.location,
        skills: JSON.stringify(profile.skills),
      },
      update: {
        displayName: profile.displayName,
        headline: profile.headline,
        bio: profile.bio,
        location: profile.location,
        skills: JSON.stringify(profile.skills),
      },
    })));
  }

  const jobs = Array.from({ length: JOB_COUNT }, (_, index) => {
    const kind = jobKinds[index % jobKinds.length]!;
    const currency = index % 3 === 0 ? "MMK" : "USD";
    const min = currency === "USD" ? 250 + (index % 24) * 75 : 180_000 + (index % 24) * 125_000;
    const max = currency === "USD" ? min + 450 + (index % 7) * 100 : min + 400_000 + (index % 7) * 100_000;
    return {
      id: `seed_job_${String(index + 1).padStart(4, "0")}`,
      clientId: clients[index % clients.length]!.id,
      title: `${kind.title}${index >= jobKinds.length ? ` · ${String(index + 1).padStart(3, "0")}` : ""}`,
      description: `${kind.description}\n\nFocus area: ${kind.skill}. This is sample content to make the opportunity board useful for local development and UI review. The client is open to a thoughtful proposal with relevant examples and a clear approach.`,
      budgetType: index % 4 === 0 ? "HOURLY" : "FIXED",
      budgetMin: String(min),
      budgetMax: String(max),
      currency,
      status: index % 8 === 0 ? "CLOSED" : "OPEN",
      createdAt: daysAgo(index % 90),
    };
  });
  await inBatches(jobs, (job) => [
    prisma.job.upsert({
      where: { id: job.id },
      create: job,
      update: {
        clientId: job.clientId,
        title: job.title,
        description: job.description,
        budgetType: job.budgetType,
        budgetMin: job.budgetMin,
        budgetMax: job.budgetMax,
        currency: job.currency,
        status: job.status,
      },
    }),
  ]);

  const proposals = jobs.flatMap((job, jobIndex) => Array.from({ length: PROPOSALS_PER_JOB }, (_, proposalIndex) => {
    const freelancer = freelancers[(jobIndex * 13 + proposalIndex * 29) % freelancers.length]!;
    const id = `seed_proposal_${String(jobIndex + 1).padStart(4, "0")}_${proposalIndex + 1}`;
    return {
      id,
      jobId: job.id,
      freelancerId: freelancer.id,
      coverLetter: `${proposalOpeners[(jobIndex + proposalIndex) % proposalOpeners.length]}\n\nMy experience with ${jobKinds[jobIndex % jobKinds.length]!.skill.toLowerCase()} would help me make a strong contribution here. I can share relevant work and agree on a clear first milestone together.`,
      bidAmount: String(Math.round(Number(job.budgetMin) + (Number(job.budgetMax) - Number(job.budgetMin)) * (0.35 + proposalIndex * 0.15))),
      currency: job.currency,
      status: (jobIndex + proposalIndex) % 13 === 0 ? "REJECTED" : (jobIndex + proposalIndex) % 17 === 0 ? "WITHDRAWN" : "PENDING",
      createdAt: daysAgo((jobIndex + proposalIndex * 3) % 60),
      conversationId: `seed_conversation_${String(jobIndex + 1).padStart(4, "0")}_${proposalIndex + 1}`,
      clientId: job.clientId,
    };
  }));
  await inBatches(proposals, (proposal) => [
    prisma.proposal.upsert({
      where: { id: proposal.id },
      create: {
        id: proposal.id,
        jobId: proposal.jobId,
        freelancerId: proposal.freelancerId,
        coverLetter: proposal.coverLetter,
        bidAmount: proposal.bidAmount,
        currency: proposal.currency,
        status: proposal.status,
        createdAt: proposal.createdAt,
      },
      update: {
        coverLetter: proposal.coverLetter,
        bidAmount: proposal.bidAmount,
        currency: proposal.currency,
        status: proposal.status,
      },
    }),
  ]);

  await inBatches(proposals, (proposal) => [
    prisma.conversation.upsert({
      where: { proposalId: proposal.id },
      create: {
        id: proposal.conversationId,
        proposalId: proposal.id,
        jobId: proposal.jobId,
        clientId: proposal.clientId,
        freelancerId: proposal.freelancerId,
        createdAt: proposal.createdAt,
      },
      update: {
        jobId: proposal.jobId,
        clientId: proposal.clientId,
        freelancerId: proposal.freelancerId,
      },
    }),
  ]);

  const messages = proposals.flatMap((proposal, index) => {
    const messageCount = index % 5 === 0 ? 3 : 2;
    return Array.from({ length: messageCount }, (_, messageIndex) => {
      const senderId = messageIndex % 2 === 0 ? proposal.freelancerId : proposal.clientId;
      return {
        id: `seed_message_${String(index + 1).padStart(5, "0")}_${messageIndex + 1}`,
        conversationId: proposal.conversationId,
        senderId,
        body: messageBodies[(index + messageIndex) % messageBodies.length]!,
        createdAt: new Date(proposal.createdAt.getTime() + (messageIndex + 1) * 3_600_000),
      };
    });
  });
  await inBatches(messages, (message) => [
    prisma.message.upsert({
      where: { id: message.id },
      create: message,
      update: { conversationId: message.conversationId, senderId: message.senderId, body: message.body },
    }),
  ]);

  console.log("Archer sample data is ready:");
  console.log(`  ${CLIENT_COUNT} clients, ${FREELANCER_COUNT} freelancers, and 1 admin`);
  console.log(`  ${JOB_COUNT} jobs (${Math.ceil(JOB_COUNT / 8)} closed; the rest open)`);
  console.log(`  ${proposals.length} proposals and conversations`);
  console.log(`  ${messages.length} messages`);
  console.log(`  Demo admin account: ${demoAdmin.email}`);
  console.log(`  Sample password for all sample accounts: ${SAMPLE_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error("Could not seed Archer sample data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

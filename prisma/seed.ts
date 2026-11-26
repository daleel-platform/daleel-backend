import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { MessageType, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const DEV_PASSWORD = 'DaleelTest@123';

interface SeedMentorInput {
  email: string;
  name: string;
  bio: string;
  interests: string[];
  headline: string;
  about: string;
  skills: string[];
  yearsOfExperience: number;
  linkedinUrl: string;
  isActive: boolean;
}

const MENTORS_TO_SEED: readonly SeedMentorInput[] = [
  {
    email: 'sarah.mansour@daleel.dev',
    name: 'Sarah Mansour',
    bio: 'Staff engineer focused on high-throughput distributed systems and backend architecture.',
    interests: ['System Design', 'Tech Leadership'],
    headline: 'Staff Software Engineer at Stripe',
    about:
      'I help senior engineers bridge the gap to Staff+ through structured system architecture reviews, technical writing, and high-leverage engineering leadership.',
    skills: ['System Design', 'Tech Leadership', 'TypeScript', 'AWS'],
    yearsOfExperience: 11,
    linkedinUrl: 'https://www.linkedin.com/in/sarah-mansour-daleel',
    isActive: true,
  },
  {
    email: 'omar.sherif@daleel.dev',
    name: 'Omar Sherif',
    bio: 'Former founder turned VP of Product scaling marketplace teams across MENA.',
    interests: ['Product Strategy', 'Tech Leadership'],
    headline: 'VP of Product at Careem',
    about:
      'Coaching product managers on product strategy, stakeholder alignment, growth loops, and preparing for senior PM and director interviews.',
    skills: ['Product Strategy', 'Tech Leadership', 'Figma'],
    yearsOfExperience: 14,
    linkedinUrl: 'https://www.linkedin.com/in/omar-sherif-daleel',
    isActive: true,
  },
  {
    email: 'lina.haddad@daleel.dev',
    name: 'Lina Haddad',
    bio: 'Design director passionate about accessible design systems and craft.',
    interests: ['Figma', 'Product Strategy'],
    headline: 'Design Director at Instabug',
    about:
      'I work with product designers on portfolio storytelling, design systems architecture, and transitioning into design leadership.',
    skills: ['Figma', 'React', 'Product Strategy'],
    yearsOfExperience: 9,
    linkedinUrl: 'https://www.linkedin.com/in/lina-haddad-daleel',
    isActive: true,
  },
  {
    email: 'khaled.elsayed@daleel.dev',
    name: 'Khaled El-Sayed',
    bio: 'Principal AI researcher shipping production LLM and computer vision pipelines.',
    interests: ['LLMs', 'Python'],
    headline: 'Principal AI Researcher at Siemens Health',
    about:
      'Guiding ML engineers on practical LLM evaluation, RAG pipelines, PyTorch optimization, and transitioning research prototypes into production.',
    skills: ['LLMs', 'Python', 'System Design', 'AWS'],
    yearsOfExperience: 10,
    linkedinUrl: 'https://www.linkedin.com/in/khaled-elsayed-daleel',
    isActive: true,
  },
  {
    email: 'yasmine.adel@daleel.dev',
    name: 'Yasmine Adel',
    bio: 'Engineering executive mentoring managers and tech leads on scaling teams.',
    interests: ['Tech Leadership', 'System Design'],
    headline: 'Head of Engineering at Swvl',
    about:
      'Helping new engineering managers navigate 1-on-1s, performance calibration, hiring pipelines, and cross-functional delivery.',
    skills: ['Tech Leadership', 'System Design', 'DevOps'],
    yearsOfExperience: 13,
    linkedinUrl: 'https://www.linkedin.com/in/yasmine-adel-daleel',
    isActive: true,
  },
  {
    email: 'tarek.fathy@daleel.dev',
    name: 'Tarek Fathy',
    bio: 'Cloud architect designing resilient multi-region Kubernetes platforms.',
    interests: ['Kubernetes', 'AWS', 'DevOps'],
    headline: 'Lead Cloud Architect at Vodafone',
    about:
      'Practical mentorship on AWS networking, Kubernetes cluster operations, CI/CD automation, and site reliability engineering.',
    skills: ['AWS', 'Kubernetes', 'DevOps', 'System Design'],
    yearsOfExperience: 8,
    linkedinUrl: 'https://www.linkedin.com/in/tarek-fathy-daleel',
    isActive: true,
  },
  {
    email: 'nada.hassan@daleel.dev',
    name: 'Nada Hassan',
    bio: 'Senior frontend engineer focused on React performance and web accessibility.',
    interests: ['React', 'TypeScript'],
    headline: 'Senior Frontend Engineer at Vercel',
    about:
      'Deep dives into React rendering patterns, TypeScript type-level design, frontend testing strategies, and developer experience.',
    skills: ['React', 'TypeScript', 'Figma'],
    yearsOfExperience: 6,
    linkedinUrl: 'https://www.linkedin.com/in/nada-hassan-daleel',
    isActive: true,
  },
  {
    email: 'karim.nasser@daleel.dev',
    name: 'Karim Nasser',
    bio: 'Staff backend engineer building low-latency payment rails and ledgers.',
    interests: ['System Design', 'TypeScript'],
    headline: 'Staff Backend Engineer at Fawry',
    about:
      'Mentoring backend developers on idempotent APIs, database indexing, event-driven microservices, and fintech reliability.',
    skills: ['System Design', 'TypeScript', 'AWS'],
    yearsOfExperience: 9,
    linkedinUrl: 'https://www.linkedin.com/in/karim-nasser-daleel',
    isActive: true,
  },
  {
    email: 'salma.ibrahim@daleel.dev',
    name: 'Salma Ibrahim',
    bio: 'Product leader specializing in consumer growth and experimentation.',
    interests: ['Product Strategy', 'LLMs'],
    headline: 'Senior Product Manager at Talabat',
    about:
      'I help aspiring and mid-level PMs structure product sense answers, design A/B experiments, and build data-informed roadmaps.',
    skills: ['Product Strategy', 'Python', 'LLMs'],
    yearsOfExperience: 7,
    linkedinUrl: 'https://www.linkedin.com/in/salma-ibrahim-daleel',
    isActive: true,
  },
  {
    email: 'mostafa.reda@daleel.dev',
    name: 'Mostafa Reda',
    bio: 'Mobile architect shipping cross-platform apps to millions of daily users.',
    interests: ['React', 'TypeScript'],
    headline: 'Staff Mobile Engineer at Noon',
    about:
      'Guiding engineers on mobile app architecture, offline sync, native performance profiling, and engineering career growth.',
    skills: ['React', 'TypeScript', 'System Design'],
    yearsOfExperience: 8,
    linkedinUrl: 'https://www.linkedin.com/in/mostafa-reda-daleel',
    isActive: true,
  },
  {
    email: 'dina.kamel@daleel.dev',
    name: 'Dina Kamel',
    bio: 'Principal data engineer architecting real-time streaming analytics.',
    interests: ['Python', 'AWS'],
    headline: 'Principal Data Engineer at Paymob',
    about:
      'Mentoring data and backend engineers on Python data pipelines, distributed SQL tuning, and cloud cost optimization.',
    skills: ['Python', 'AWS', 'System Design'],
    yearsOfExperience: 10,
    linkedinUrl: 'https://www.linkedin.com/in/dina-kamel-daleel',
    isActive: true,
  },
  {
    email: 'ziad.mahmoud@daleel.dev',
    name: 'Ziad Mahmoud',
    bio: 'DevOps & platform lead helping teams ship safely multiple times a day.',
    interests: ['DevOps', 'Kubernetes'],
    headline: 'DevOps Lead at AWS',
    about:
      'Hands-on guidance on Terraform modules, observability stacks, Kubernetes security, and preparing for cloud certifications.',
    skills: ['DevOps', 'Kubernetes', 'AWS', 'Python'],
    yearsOfExperience: 12,
    linkedinUrl: 'https://www.linkedin.com/in/ziad-mahmoud-daleel',
    isActive: true,
  },
  {
    email: 'hana.farouk@daleel.dev',
    name: 'Hana Farouk',
    bio: 'Engineering manager passionate about early-career mentorship and inclusive teams.',
    interests: ['Tech Leadership', 'React'],
    headline: 'Engineering Manager at Microsoft',
    about:
      'Supporting junior-to-mid engineers with career planning, code review habits, interview preparation, and confident communication.',
    skills: ['Tech Leadership', 'React', 'TypeScript'],
    yearsOfExperience: 11,
    linkedinUrl: 'https://www.linkedin.com/in/hana-farouk-daleel',
    isActive: true,
  },
  {
    email: 'amr.sadek@daleel.dev',
    name: 'Amr Sadek',
    bio: 'Application security engineer helping teams build secure-by-default services.',
    interests: ['System Design', 'DevOps'],
    headline: 'Senior Security Engineer at Cloudflare',
    about:
      'Mentoring engineers on threat modeling, OAuth/JWT security pitfalls, zero-trust infrastructure, and secure coding practices.',
    skills: ['System Design', 'DevOps', 'Kubernetes'],
    yearsOfExperience: 7,
    linkedinUrl: 'https://www.linkedin.com/in/amr-sadek-daleel',
    isActive: true,
  },
  {
    email: 'ramy.gaber@daleel.dev',
    name: 'Ramy Gaber',
    bio: 'Backend architect currently on sabbatical from active mentoring.',
    interests: ['System Design'],
    headline: 'Principal Engineer at Careem',
    about: 'Focused on distributed consensus and high-availability services.',
    skills: ['System Design', 'AWS'],
    yearsOfExperience: 15,
    linkedinUrl: 'https://www.linkedin.com/in/ramy-gaber-daleel',
    isActive: false,
  },
];

interface SeedExperienceInput {
  title: string;
  company: string;
  startYear: number;
  endYear: number | null;
  summary: string;
}

function buildSeedExperiences(mentor: SeedMentorInput): SeedExperienceInput[] {
  const parts = mentor.headline.split(/\s+at\s+/i);
  const currentTitle = parts[0] || mentor.headline;
  const currentCompany = parts[1] || 'Tech Corp';
  const currentYear = 2026;
  const currentRoleYears = Math.max(
    2,
    Math.min(4, Math.floor(mentor.yearsOfExperience / 2)),
  );
  const currentStart = currentYear - currentRoleYears;
  const prevStart = Math.max(2010, currentYear - mentor.yearsOfExperience);

  const entries: SeedExperienceInput[] = [
    {
      title: currentTitle,
      company: currentCompany,
      startYear: currentStart,
      endYear: null,
      summary: mentor.about,
    },
  ];

  if (currentStart > prevStart + 1) {
    entries.push({
      title: `Senior ${currentTitle.replace(/^(Staff|Principal|Lead|VP of|Head of|Senior)\s+/i, '')}`,
      company: 'Previous Tech Organization',
      startYear: prevStart,
      endYear: currentStart,
      summary: `Owned core ${mentor.skills.slice(0, 2).join(' & ')} initiatives, mentored engineers across squads, and drove production reliability.`,
    });
  }

  return entries;
}

function canonicalParticipants(
  userA: string,
  userB: string,
): { participant1Id: string; participant2Id: string } {
  return userA < userB
    ? { participant1Id: userA, participant2Id: userB }
    : { participant1Id: userB, participant2Id: userA };
}

async function seedConversationWithMessages(
  prisma: PrismaClient,
  userAId: string,
  userBId: string,
  messages: readonly {
    senderId: string;
    content: string;
    isEdited?: boolean;
  }[],
): Promise<boolean> {
  const { participant1Id, participant2Id } = canonicalParticipants(
    userAId,
    userBId,
  );

  const conversation = await prisma.conversation.upsert({
    where: {
      participant1Id_participant2Id: { participant1Id, participant2Id },
    },
    update: {},
    create: { participant1Id, participant2Id },
  });

  const existingCount = await prisma.message.count({
    where: { conversationId: conversation.id },
  });

  if (existingCount > 0) {
    return false;
  }

  const now = Date.now();
  const total = messages.length;
  let firstMessageId: string | null = null;

  for (let i = 0; i < total; i += 1) {
    const item = messages[i];
    const timestamp = new Date(now - (total - i) * 5 * 60 * 1000);
    const created = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: item.senderId,
        type: MessageType.TEXT,
        content: item.content,
        isEdited: Boolean(item.isEdited),
        replyToId: i === 2 && firstMessageId ? firstMessageId : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    if (i === 0) {
      firstMessageId = created.id;
    }
  }

  if (total > 0) {
    const latestTimestamp = new Date(now - 5 * 60 * 1000);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: latestTimestamp },
    });
  }

  return true;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment');
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

    // 1. Seed Demo Mentees
    const demoMentee = await prisma.user.upsert({
      where: { email: 'mentee@daleel.dev' },
      update: {
        name: 'Ali Hassan',
        bio: 'Software engineer leveling up in system design, TypeScript, and engineering leadership.',
        interests: ['System Design', 'TypeScript', 'React', 'Tech Leadership'],
      },
      create: {
        email: 'mentee@daleel.dev',
        passwordHash,
        name: 'Ali Hassan',
        bio: 'Software engineer leveling up in system design, TypeScript, and engineering leadership.',
        interests: ['System Design', 'TypeScript', 'React', 'Tech Leadership'],
      },
    });

    const freshMentee = await prisma.user.upsert({
      where: { email: 'new.mentee@daleel.dev' },
      update: {
        name: 'Nour El-Din',
        bio: null,
        interests: [],
      },
      create: {
        email: 'new.mentee@daleel.dev',
        passwordHash,
        name: 'Nour El-Din',
        bio: null,
        interests: [],
      },
    });

    // 2. Seed Mentors (14 active, 1 inactive)
    const seededMentorsByEmail = new Map<string, string>();
    for (const mentor of MENTORS_TO_SEED) {
      const user = await prisma.user.upsert({
        where: { email: mentor.email },
        update: {
          name: mentor.name,
          bio: mentor.bio,
          interests: mentor.interests,
        },
        create: {
          email: mentor.email,
          passwordHash,
          name: mentor.name,
          bio: mentor.bio,
          interests: mentor.interests,
        },
      });

      const mentorProfile = await prisma.mentorProfile.upsert({
        where: { userId: user.id },
        update: {
          headline: mentor.headline,
          about: mentor.about,
          skills: mentor.skills,
          yearsOfExperience: mentor.yearsOfExperience,
          linkedinUrl: mentor.linkedinUrl,
          isActive: mentor.isActive,
        },
        create: {
          userId: user.id,
          headline: mentor.headline,
          about: mentor.about,
          skills: mentor.skills,
          yearsOfExperience: mentor.yearsOfExperience,
          linkedinUrl: mentor.linkedinUrl,
          isActive: mentor.isActive,
        },
      });

      const existingExperiences = await prisma.mentorExperience.count({
        where: { mentorProfileId: mentorProfile.id },
      });
      if (existingExperiences === 0) {
        await prisma.mentorExperience.createMany({
          data: buildSeedExperiences(mentor).map((exp) => ({
            mentorProfileId: mentorProfile.id,
            title: exp.title,
            company: exp.company,
            startYear: exp.startYear,
            endYear: exp.endYear,
            summary: exp.summary,
          })),
        });
        await prisma.mentorProfile.update({
          where: { id: mentorProfile.id },
          data: { embeddingModel: null },
        });
      }

      seededMentorsByEmail.set(mentor.email, user.id);
    }

    // 3. Seed Conversations & Messages for demoMentee (including a 65-message thread for pagination testing)
    const sarahId = seededMentorsByEmail.get('sarah.mansour@daleel.dev');
    const omarId = seededMentorsByEmail.get('omar.sherif@daleel.dev');
    const linaId = seededMentorsByEmail.get('lina.haddad@daleel.dev');
    const khaledId = seededMentorsByEmail.get('khaled.elsayed@daleel.dev');

    let seededThreads = 0;

    if (sarahId) {
      const longThread: {
        senderId: string;
        content: string;
        isEdited?: boolean;
      }[] = [
        {
          senderId: demoMentee.id,
          content:
            'Hi Sarah! I saw your profile and would love to discuss transitioning from senior backend work to Staff-level architecture.',
        },
        {
          senderId: sarahId,
          content:
            'Hi Ali! Welcome — happy to help. What kind of systems are you currently owning?',
        },
        {
          senderId: demoMentee.id,
          content:
            'Mostly NestJS microservices, PostgreSQL, and a few async worker queues.',
          isEdited: true,
        },
      ];

      for (let i = 4; i <= 65; i += 1) {
        const fromMentee = i % 2 === 0;
        longThread.push({
          senderId: fromMentee ? demoMentee.id : sarahId,
          content: fromMentee
            ? `Message #${i}: Sharing follow-up notes on RFC structure, latency budgets, and service boundaries.`
            : `Message #${i}: Great point — focus on clear trade-offs, failure modes, and measurable SLOs in your RFC.`,
        });
      }

      if (
        await seedConversationWithMessages(
          prisma,
          demoMentee.id,
          sarahId,
          longThread,
        )
      ) {
        seededThreads += 1;
      }
    }

    if (omarId) {
      if (
        await seedConversationWithMessages(prisma, demoMentee.id, omarId, [
          {
            senderId: demoMentee.id,
            content:
              'Hey Omar, I am preparing for a technical product leadership interview next week.',
          },
          {
            senderId: omarId,
            content:
              'Awesome! Make sure you frame your past projects around user outcomes and business metrics, not just shipping features.',
          },
          {
            senderId: demoMentee.id,
            content:
              'Makes total sense, thank you! Would love a mock review soon.',
          },
        ])
      ) {
        seededThreads += 1;
      }
    }

    if (linaId) {
      if (
        await seedConversationWithMessages(prisma, demoMentee.id, linaId, [
          {
            senderId: demoMentee.id,
            content:
              'Hi Lina, our engineering team is building a shared UI token system — any tips for aligning with designers?',
          },
          {
            senderId: linaId,
            content:
              'Start with semantic tokens before component variants so Figma and code speak the exact same language.',
          },
        ])
      ) {
        seededThreads += 1;
      }
    }

    if (khaledId) {
      if (
        await seedConversationWithMessages(prisma, demoMentee.id, khaledId, [
          {
            senderId: demoMentee.id,
            content:
              'Hi Khaled, curious how you evaluate semantic matching quality in production.',
          },
          {
            senderId: khaledId,
            content:
              'Start with a small labeled golden set of queries and measure recall@k before tuning model weights.',
          },
        ])
      ) {
        seededThreads += 1;
      }
    }

    console.log('Seed completed successfully:');
    console.log(
      `- Demo mentee (onboarded): ${demoMentee.email} / ${DEV_PASSWORD}`,
    );
    console.log(
      `- Fresh mentee (onboarding test): ${freshMentee.email} / ${DEV_PASSWORD}`,
    );
    console.log(
      `- Mentors seeded/updated: ${MENTORS_TO_SEED.length} (14 active, 1 inactive; password: ${DEV_PASSWORD})`,
    );
    console.log(`- New conversation threads populated: ${seededThreads}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Database seed failed:', error);
  process.exitCode = 1;
});

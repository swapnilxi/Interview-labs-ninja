import type { LinkedInTemplateType } from '@/lib/services/linkedinService';

export interface InspirationPost {
  id: string;
  category: string;
  title: string;
  content: string;
  whyItWorks: string[];
  tags: string[];
  suggestedType: LinkedInTemplateType;
}

export const INSPIRATION_CATEGORIES = [
  'Personal Story',
  'Contrarian Take',
  'Career Milestone',
  'Lessons Learned',
  'Listicle / Framework',
  'Case Study',
  'Thought Leadership',
  'Achievement',
] as const;

export const INSPIRATION_POSTS: InspirationPost[] = [
  {
    id: 'rejection-that-changed-everything',
    category: 'Personal Story',
    title: 'The rejection that changed everything',
    content: `I got rejected from my dream job 3 years ago today.

The recruiter's email was polite. Generic. "We've decided to move forward with other candidates."

I remember reading it twice, hoping the second read would say something different.

It didn't.

So I did what most of us do — I sulked for a week, then opened my laptop and started building the thing I pitched in that interview, just for myself.

No job. No deadline. No boss.

Six months later that side project had 400 users.
A year later it had a paying customer.
Today it's the reason I get to write this post as a founder instead of an employee.

The rejection didn't derail my career. It removed the one thing that was holding me back from starting: permission.

If you're sitting on an idea waiting for someone to tell you it's good enough — stop waiting.

What's the "rejection" that ended up pushing you forward?`,
    whyItWorks: [
      'Cold open with a specific, dated stake ("3 years ago today") — no throat-clearing before the hook',
      'Short, single-sentence paragraphs create scannable whitespace on mobile',
      'Turns a setback into a concrete, numbered outcome (users → customer → founder)',
      'Closes with a direct question that invites comments, not just likes',
    ],
    tags: ['storytelling', 'career', 'resilience'],
    suggestedType: 'reference_post',
  },
  {
    id: 'unpopular-opinion-hustle',
    category: 'Contrarian Take',
    title: 'Unpopular opinion: hustle culture is a productivity tax',
    content: `Unpopular opinion: the 12-hour workday is making you slower, not faster.

I used to wear my 80-hour weeks like a badge. More hours meant more output — obviously.

Except it didn't.

I tracked my actual focused output for a month across every hour I worked. The data was embarrassing:
— Hours 1-6: 70% of my meaningful output
— Hours 7-9: 22%
— Hours 10-12: 8%, mostly re-doing mistakes from hour 10

I was paying a "fatigue tax" on every extra hour, and it was compounding.

Since capping my day at 7 focused hours:
→ Shipped 2 more features per quarter
→ Cut code review back-and-forth by half
→ Actually remember what my kids said at dinner

Hustle culture sells hours as the metric. The real metric is energy per hour, and it collapses long before your calendar says you're done.

What's one habit you dropped that made you MORE productive, not less?`,
    whyItWorks: [
      'States the contrarian claim in the first line — forces a reaction (agree or argue) immediately',
      'Backs the opinion with self-reported data instead of just asserting it',
      'Uses arrows/bullets sparingly to break up a results list without turning into a wall of text',
      'Ends with a question that specifically invites disagreement, which drives comments',
    ],
    tags: ['contrarian', 'productivity', 'thought-leadership'],
    suggestedType: 'reference_post',
  },
  {
    id: 'promoted-twice-in-a-year',
    category: 'Career Milestone',
    title: 'Promoted twice in one year — here is what actually got me there',
    content: `I got promoted twice this year. Not because I worked the most hours, and not because I was the most technically skilled person on my team.

Here's what actually moved the needle:

1. I started saying "here's what I recommend" instead of "what should we do?"
Nobody promotes someone who only asks questions. They promote people who bring answers.

2. I made my manager's job easier, on purpose.
Before every 1:1, I sent a 3-line update: what shipped, what's blocked, what I need. She stopped having to chase me for status — she started bringing me into rooms I wasn't invited to before.

3. I fixed things nobody assigned to me.
Our onboarding docs were a mess. Nobody owned them. I spent two weekends rewriting them. It wasn't glamorous, but it was visible, and it signaled ownership beyond my ticket queue.

None of this was about being the smartest person in the room. It was about being the easiest person to trust with more.

If you're waiting for a title to start acting like the next level — you have it backwards.`,
    whyItWorks: [
      'Leads with a concrete, quantifiable result (two promotions, one year) that earns attention',
      'Numbered list format makes career advice skimmable and highly shareable/saveable',
      'Each point pairs a behavior with a tangible outcome, avoiding vague platitudes',
      'Closing line reframes the whole post as actionable advice, not just a brag',
    ],
    tags: ['career', 'promotion', 'leadership'],
    suggestedType: 'post_structure',
  },
  {
    id: 'shipped-broke-prod',
    category: 'Lessons Learned',
    title: 'I broke production on my first week. Here is what I learned.',
    content: `Day 4 on the job, I took down production for 40 minutes.

One migration script. No feature flag. No rollback plan. I ran it at 2pm — peak traffic — because I "wanted to get it done before lunch ended."

My Slack lit up. My manager didn't yell. She said one sentence I still repeat to every new hire I mentor:

"The bug isn't the problem. The absence of a rollback plan is."

We fixed it in 12 minutes once we stopped panicking and started rolling back methodically instead of trying to patch forward.

Three things changed for me after that day:
— I never ship without asking "what does undo look like?"
— I stopped treating incidents as personal failures and started treating them as missing process
— I became the person on my team who writes the rollback plan first, code second

The mistake cost us 40 minutes of downtime. The lesson has saved us dozens of incidents since.

What's a mistake early in your career that permanently changed how you work?`,
    whyItWorks: [
      'Vulnerability up front (admitting a failure) builds trust faster than a highlight reel',
      'Quotes the exact sentence that reframed the lesson — specific dialogue is more memorable than a summary',
      'Converts the incident into a repeatable, generalizable rule readers can apply immediately',
      'Question at the end targets a universal experience, which widens who feels compelled to reply',
    ],
    tags: ['engineering', 'lessons-learned', 'mistakes'],
    suggestedType: 'reference_post',
  },
  {
    id: 'five-questions-before-quitting',
    category: 'Listicle / Framework',
    title: '5 questions to ask before you quit your job',
    content: `Before you hand in your resignation, ask yourself these 5 questions. I wish someone had asked me these before my last "impulse quit."

1. Is this the job, or is this the manager?
Changing companies won't fix a bad-manager problem if you land under another one just like them.

2. What am I actually running from?
Boredom, burnout, and being underpaid require completely different exits. Name the real problem before you solve the wrong one.

3. Have I said the hard thing out loud, to the person who can fix it?
Most people quit conversations they never actually had.

4. What does my runway look like without a signing bonus?
Not "can I survive" — "can I make a calm decision" for the next 90 days.

5. Will future-me thank present-me for staying 6 more months, or leaving now?
Sometimes the answer is leave immediately. Sometimes it's stack one more win first. Both are valid — but only if you actually asked.

I've quit for the wrong reasons before. This list is what I use now instead.

Which of these hits hardest for you right now?`,
    whyItWorks: [
      'Numbered framework format is inherently save-worthy — readers bookmark lists to revisit',
      'Each item is a question, not an instruction, which invites self-reflection instead of lecturing',
      'Personal credibility line ("I\'ve quit for the wrong reasons before") earns the right to give advice',
      'Ends by asking which point resonated, which is easy for anyone to answer in one word',
    ],
    tags: ['career', 'framework', 'listicle'],
    suggestedType: 'post_structure',
  },
  {
    id: 'reduced-onboarding-time-case-study',
    category: 'Case Study',
    title: 'How we cut new-hire ramp time from 6 weeks to 9 days',
    content: `Our new engineers took 6 weeks to ship their first PR. Now it takes 9 days. Here's exactly what we changed.

The problem: every new hire independently re-discovered the same 20 landmines — undocumented services, tribal-knowledge deploy steps, "ask Sarah" dependencies.

The fix, in order:

1. We recorded a 15-minute "day one" video walking through the actual repo, not a slide deck.
2. We wrote a single checklist doc that maps every "ask Sarah" moment to a written answer.
3. We assigned every new hire a real, small, shippable ticket on day 2 — not a toy project.
4. We measured time-to-first-PR as a team metric, not just an individual one.

The result after 4 cohorts:
— Time to first PR: 6 weeks → 9 days
— New-hire Slack questions in week 1: down 60%
— "Sarah" (our senior engineer) got 5 hours a week back

The biggest unlock wasn't the docs. It was measuring the metric at all — you can't fix what you don't track.

Happy to share the exact checklist template if it's useful to your team.`,
    whyItWorks: [
      'Headline states a specific, believable before/after metric instead of a vague claim',
      'Numbered "fix" list reads like a reusable playbook rather than a one-off anecdote',
      'Quantifies results across multiple dimensions (time, questions, hours saved), not just one',
      'Soft CTA at the end ("happy to share the template") drives DMs and comments without sounding salesy',
    ],
    tags: ['case-study', 'engineering-management', 'process'],
    suggestedType: 'post_structure',
  },
  {
    id: 'nobody-tells-you-about-founders',
    category: 'Thought Leadership',
    title: 'Nobody tells first-time founders this part',
    content: `Nobody tells first-time founders this: the hardest part isn't the idea, the funding, or the product. It's staying decisive when you have no data and everyone has an opinion.

In year one, I got advice from investors, mentors, my co-founder, Twitter threads, and my own doubt — often all contradicting each other, all on the same decision.

Here's what I've learned separates founders who move fast from founders who stall:

They don't wait for consensus. They set a decision deadline, gather input until that deadline, then decide and own it.

They don't confuse "more opinions" with "more clarity." Past a certain point, more input just adds noise dressed up as due diligence.

They treat wrong decisions as cheap to reverse and right decisions as impossible to make without moving first.

The market doesn't reward the founder with the most validated opinion. It rewards the one who shipped, learned, and adjusted three cycles before the "careful" founder finished their research.

Speed of decision-making, not quality of any single decision, is the actual moat in year one.`,
    whyItWorks: [
      'Opens by naming a widely-felt but rarely-articulated pain point ("nobody tells you")',
      'Builds an argument in escalating steps rather than a flat list, which suits a thought-leadership tone',
      'Uses a memorable, quotable closing line ("speed of decision-making... is the actual moat") designed to be screenshotted',
      'No question at the end — confident, declarative posts can outperform when the authority itself is the hook',
    ],
    tags: ['startup', 'founder', 'decision-making'],
    suggestedType: 'writing_style',
  },
  {
    id: 'first-1000-users-launch',
    category: 'Achievement',
    title: 'We just crossed 1,000 users — the numbers behind it',
    content: `1,000 users. 0 dollars on ads. Here's exactly where every single one came from.

We launched 4 months ago with a Notion doc and a waitlist form. No landing page agency, no growth hacks.

The breakdown:
— 41% from a single post in a niche community we'd been active in for a year before we ever pitched the product
— 27% from users referring a colleague after their first "aha" moment in week one
— 18% from a founder-led cold outreach list of 300 people we hand-picked
— 14% from organic search on one blog post that answered a very specific question

The pattern across all four channels: every user came from somewhere we'd already built trust, not somewhere we bought attention.

We're nowhere close to done, but this milestone taught us that "distribution" isn't a channel you turn on — it's compounding interest on relationships you started before you needed them.

Grateful to everyone who took a chance on an early, rough product. On to the next 1,000.`,
    whyItWorks: [
      'Leads with the milestone number and a surprising constraint ("$0 on ads") in one line',
      'Breaks down attribution with real percentages — specificity signals authenticity over a generic "thank you" post',
      'Extracts a general, reusable principle (trust compounds before you need it) instead of just celebrating',
      'Closes with gratitude, which invites well-wishes and shares without explicitly asking for engagement',
    ],
    tags: ['launch', 'growth', 'milestone'],
    suggestedType: 'reference_post',
  },
];

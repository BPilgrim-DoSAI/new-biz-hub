// Curated, role-aware prompts for the Claude onboarding pathway.

const ROLES = [
  { id: 'all',      label: 'All' },
  { id: 'account',  label: 'Account & Client Services' },
  { id: 'strategy', label: 'Strategy & Planning' },
  { id: 'creative', label: 'Creative & Production' },
  { id: 'media',    label: 'Media Planning & Buying' },
  { id: 'pr',       label: 'PR & Comms' },
  { id: 'social',   label: 'Social & Content' },
  { id: 'finance',  label: 'Finance' },
  { id: 'web',      label: 'Technology & Development' },
];

const PROMPT_LIBRARY = {
  // ============================================================
  // STAGE 1 — THE BASICS
  // ============================================================
  s1_profile: {
    stage: 1,
    label: 'Onboarding buddy',
    whyItWorks: 'Asks Claude to interview you, then writes your preferences for you — better than a blank text box.',
    slots: [],
    text: {
      all: `I'm setting up the Personal Preferences section of my Claude profile. Act as an onboarding buddy. Ask me 5 short questions one at a time about: my role at [AGENCY], the kinds of tasks I'll bring to you, my preferred output format (bullets vs prose, brief vs detailed), my tone preferences, and whether you should ask clarifying questions or just have a go. After my answers, draft a 100-word Personal Preferences block I can paste into Settings → General.`,
    },
  },
  s1_first_artifact: {
    stage: 1,
    label: 'Build me something useful',
    whyItWorks: 'Artifacts are formatted, ready-to-use outputs — not just text. This prompt builds one pre-filled for your role so you see the value immediately without having to fill anything in.',
    slots: [],
    text: {
      all:      `Show me three Artifacts you could build for someone working at a marketing and advertising agency — make each one genuinely useful for day-to-day work. Pick the most useful one and build it now, pre-filled with a realistic fictional example so I can see exactly how it works.`,
      account:  `Build me an Artifact: a difficult client email playbook for a senior account manager at a marketing agency. Cover 6 common situations: scope creep request, missed delivery deadline, unhappy client after a campaign underperforms, budget cut mid-project, client bypassing agency process, and a relationship that has gone cold. For each: the situation in one line, the email objective, and a ready-to-adapt template response. Pre-fill it with realistic fictional examples. Format it as something I'd keep open in a second tab and reach for whenever a difficult email lands.`,
      strategy: `Build me an Artifact: a brief interrogation checklist for a senior strategist at a marketing agency. Structure it as a set of questions to work through before accepting any client brief — covering: what is the real business problem behind the ask, what does the audience actually want vs what the client thinks they want, what assumptions are baked in that could be wrong, what is missing from the brief, and what would have to be true for this brief to be right. Pre-fill it with example answers for a fictional FMCG brief so I can see how it reads when completed. Format it as something I could use in a brief review meeting.`,
      creative: `Build me an Artifact: a copy variants matrix for a fictional product launch. Take one core message — "The coffee that keeps up with you" — and write it 8 different ways: under 8 words, 30+ words, formal tone, conversational tone, benefit-led, emotion-led, as a question, and provocative. Add a column for where each variant works best — OOH, social caption, radio, email subject line. Format it as a clean table I could drop into a creative review to show range before the team commits to a direction.`,
      media:    `Build me an Artifact: a channel strategy rationale document for a fictional Q3 campaign. The campaign is for a challenger FMCG brand targeting 25–40 year olds with a £500k media budget. Include 5 channels. For each: the channel name, its strategic role in the plan, the audience behaviour it captures, the primary KPI, and a one-sentence rationale for why it's in the plan. Close with a 3-line exec summary that explains the overall channel logic in plain English. Format it as a client-ready document I could paste into a deck.`,
      pr:       `Build me an Artifact: a spokesperson prep document for a fictional press announcement. The announcement is a marketing agency launching a new AI-powered creative service. Include 10 likely journalist questions — a mix of enthusiastic, sceptical, and difficult. For each: the question, a recommended answer (2–3 sentences, human not corporate), the key message to land, and one phrase to avoid. Add a section at the top with three things to remember before any interview. Format it as a print-ready briefing document I could hand to a client the morning of a press day.`,
      social:   `Build me an Artifact: a platform-specific caption suite for a fictional campaign. The campaign is for a challenger sports nutrition brand targeting gym-goers aged 20–35, launching a new protein range called "Form." Write one post for each platform: LinkedIn (a founder thought-leadership post, 150 words), Instagram (punchy caption under 80 words with 5 hashtags), TikTok (a hook-first spoken script, under 30 seconds), X/Twitter (a sharp take, under 240 characters), and a newsletter intro paragraph (80 words). Make each feel genuinely native to the platform — not the same post reformatted. Add a one-line note after each explaining the creative logic.`,
      finance:  `Build me an Artifact: a month-end variance commentary for a fictional marketing agency project. The project is a Q2 integrated campaign for a fictional retail client with a £150,000 budget. Make up realistic numbers: an overspend in production, an underspend in media, and a risk emerging in Q3. Write the commentary in three sections: headline performance (2 sentences a CFO would approve), variance breakdown (one short paragraph per major line explaining what happened and why in plain English a non-finance director would understand), and outlook (what to watch and what action is recommended). Format it as something a finance manager could send directly to a client or MD without editing.`,
      web:      `Build me an Artifact: a technical brief review for a fictional web project. The project is a client-facing campaign reporting dashboard for a marketing agency. First, write a realistic but underspecified brief — the kind that arrives from a client who knows what they want but not how to specify it. Then annotate it: for each section, flag what is underspecified, what assumption is risky if left unchallenged, and what question needs an answer before estimation can start. Format it as a two-column document — brief text on the left, review notes on the right — so the gaps are immediately visible.`,
    },
  },

  // ============================================================
  // STAGE 2 — PROJECTS & CONNECTORS
  // ============================================================
  s2_project_instructions: {
    stage: 2,
    label: 'Project instructions',
    whyItWorks: 'A good Project starts with a system prompt that tells Claude how to think, not just what to do.',
    slots: ['CLIENT', 'BRAND_DESCRIPTOR'],
    text: {
      all: `You are a senior strategist at [AGENCY], supporting the team working on [CLIENT]'s campaigns.

Always:
• Write in the brand's tone of voice as described in the uploaded style guide
• Refer to the brief and uploaded assets before recommending creative
• Flag if a suggestion conflicts with stated brand values or exclusivity terms
• Format deliverables clearly: headline, body, CTA, platform notes

The client is [BRAND_DESCRIPTOR]. Default to professional but creative. Avoid jargon.`,
      account: `You are a senior account director at [AGENCY], supporting the [CLIENT] account.

Always:
• Frame outputs around the client relationship — risks, opportunities, decisions needed
• Reference the brief, contact reports, and the latest status before drafting comms
• Flag where we need a client decision vs where we can proceed
• Write client-facing copy in their tone, internal copy in plain English

The client is [BRAND_DESCRIPTOR].`,
      creative: `You are a senior creative director at [AGENCY], working on [CLIENT].

Always:
• Push for ideas that feel earned by the brief, not generic
• Show your thinking as territory → concept → execution
• Match the brand's tone of voice from the style guide
• Avoid borrowing executions that resemble recent competitor campaigns

The brand is [BRAND_DESCRIPTOR].`,
      strategy: `You are a senior strategist at [AGENCY], supporting the [CLIENT] team.

Always:
• Anchor every recommendation in the audience and a clear tension
• Reference the brief, research, and any uploaded data before recommending
• Distinguish hypothesis from evidence; flag where we need more data
• Format strategic responses as: Tension → Insight → Strategic Platform → Territories

The brand is [BRAND_DESCRIPTOR].`,
      media: `You are a senior media planner at [AGENCY], supporting [CLIENT].

Always:
• Justify every channel choice against the audience and the campaign objective
• Reference the budget, KPIs, and audience definition from the brief
• Format plans clearly: channel, role in plan, audience, budget, KPI
• Flag where we're guessing vs where we have data

The brand is [BRAND_DESCRIPTOR].`,
      pr: `You are a senior PR director at [AGENCY], supporting [CLIENT].

Always:
• Lead with the news angle, never the brand
• Use the spokespeople, key messages and tone in the uploaded materials
• Format outputs cleanly: headline, dateline, body, quote, boilerplate
• Flag anything that needs legal or client sign-off before sending

The brand is [BRAND_DESCRIPTOR].`,
      social: `You are a senior social strategist at [AGENCY], supporting [CLIENT].

Always:
• Tailor every post to the platform — one platform, one post, one shape
• Reference the brand's tone and any approved creative assets
• Format outputs clearly: platform, hook, caption, CTA, hashtags
• Default to short and punchy unless asked otherwise

The brand is [BRAND_DESCRIPTOR].`,
      finance: `You are a senior finance manager at [AGENCY].

Always:
• Be precise — numbers matter and ambiguity is costly
• Identify variances and what's driving them, not just what they are
• Translate financial data into plain-English narratives I can share with non-finance stakeholders
• Flag anomalies and risks clearly before I ask
• Format outputs as tables, reports, or summaries ready to share

The business context is [BRAND_DESCRIPTOR].`,
      web: `You are a senior developer at [AGENCY].

Always:
• Write clean, well-structured code with clear comments
• When reviewing code, be specific about what's wrong and why — not just that something needs fixing
• Suggest the simplest solution that solves the problem, not the most technically impressive
• Flag security vulnerabilities, performance risks, and technical debt clearly
• Format code outputs correctly for the language and framework specified

The agency context is [BRAND_DESCRIPTOR].`,
    },
  },

  s2_test_prompt: {
    stage: 2,
    label: 'See the difference your Project makes',
    whyItWorks: 'Asking the same question outside vs inside a Project shows the lift in quality from context.',
    slots: ['CLIENT'],
    text: {
      all:      `Using everything in this Project — the brief, style guide and any other files — write three options for our hero headline. Lead with the audience tension, not the product feature. Then explain in one line why each one works.`,
      account:  `Using everything in this Project, draft a client-facing weekly status note for [CLIENT]. Tone: confident, no hedging. Sections: shipped, in flight, decisions we need.`,
      strategy: `Using everything in this Project, identify the three biggest strategic risks in the brief and how we'd address each. Be specific to [CLIENT], not generic.`,
      creative: `Using everything in this Project, generate five creative territories for [CLIENT]'s upcoming campaign. Each: territory name, one-line concept, two execution ideas across two different channels.`,
      media:    `Using everything in this Project, sense-check the proposed channel mix against the audience and KPIs in the brief. Flag where we're over-indexing or missing a channel.`,
      pr:       `Using everything in this Project, draft a 150-word press release for [CLIENT]'s upcoming announcement. Lead with the news, not the brand.`,
      social:   `Using everything in this Project, write three platform-specific captions (LinkedIn, Instagram, TikTok) for [CLIENT]'s next post. Match the brand tone exactly.`,
      finance:  `Using everything in this Project, prepare a one-page finance summary for [CLIENT]: budget status, key variances, and any risks to flag before the next review.`,
      web:      `Using everything in this Project, review the [CLIENT] technical brief and tell me the three biggest gaps or risks I need resolved before development starts.`,
    },
  },

  s2_connectors: {
    stage: 2,
    label: 'Pull from your connected tools',
    whyItWorks: "The right connector turns Claude into a live workspace — reading directly from your campaigns, designs, and documents rather than what you paste in.",
    slots: ['CLIENT'],
    text: {
      all:      `Search Google Drive for everything related to [CLIENT] from the last month — briefs, decks, contact reports. Summarise what's been agreed, what's in progress, and what's still open.`,
      account:  `Search Google Drive for the most recent contact report and status deck for [CLIENT]. List all open actions with owners and due dates, and flag anything overdue.`,
      strategy: `Search Google Drive for [CLIENT]'s latest brief, any research files, and competitor notes. Pull out the audience definition, the business objective, and the strategic gaps we haven't addressed yet.`,
      creative: `Search my Canva workspace for [CLIENT] assets. Show me the most recent campaign designs, summarise the formats and dimensions we've used across platforms, and flag anything that looks off-brand.`,
      media:    `Pull a performance report for [CLIENT]'s Meta campaigns over the last 30 days. Break down spend, reach, clicks, and ROAS by campaign and ad set. Flag which ad sets are underperforming against target and recommend whether to pause or scale each.`,
      pr:       `Search Google Drive for any [CLIENT] press coverage reports, journalist briefing notes, and media contact logs from the last two weeks. Group by outlet, summarise the key story angles, and flag anything that needs follow-up.`,
      social:   `Find all [CLIENT] templates in our Canva workspace. Summarise the formats available by platform. Then draft a brief for a new set of story-format assets based on the latest campaign direction.`,
      finance:  `Search SharePoint for the latest [CLIENT] budget file and any change-of-scope documents. Compare the agreed fee to the current cost forecast and flag where we're at risk of overrun before the next finance review.`,
      web:      `Search our Box workspace for the latest [CLIENT] technical spec, design files, and change request logs. Tell me what's been signed off, what's changed since kick-off, and what's still undefined before we start build.`,
    },
  },

  // ============================================================
  // STAGE 3 — PUT CLAUDE TO WORK (COWORK)
  // ============================================================
  s3_office_word: {
    stage: 3,
    label: 'Work on a Word document',
    whyItWorks: 'The Claude Word add-in reads your document directly — no pasting needed. Use it to draft, restructure, or sharpen anything already on the page.',
    slots: ['CLIENT'],
    text: {
      all:      `Review this document and produce a structured summary: key decisions, next steps with owners, and anything that still needs input. Use clear headings.`,
      account:  `Rewrite the executive summary of this contact report. Decisions first, then next steps with owners, then open items. No more than half a page.`,
      strategy: `Review this strategy document and add a section at the end identifying the three biggest assumptions we're making and the evidence we'd need to test each.`,
      creative: `Rewrite this creative brief so the key message is sharper and the audience section is more specific. Flag anything too vague to brief from.`,
      media:    `Review this media plan and add a short commentary: what's strong, what's missing, and one question we should go back to [CLIENT] with before we proceed.`,
      pr:       `Draft three versions of this press release — one for trade press, one for a national news desk, one for social. Same facts, adjusted angle and tone for each.`,
      social:   `Rewrite this content brief to make the platform requirements clearer. For each platform add: format, character count, and tone notes.`,
      finance:  `Review this budget document and add a commentary section flagging the three biggest variance risks before the next reporting period.`,
      web:      `Review this technical spec and add a section listing items that are underspecified — what's missing, what's ambiguous, and what needs a decision before build starts.`,
    },
  },
  s3_office_pptx: {
    stage: 3,
    label: 'Build a PowerPoint presentation',
    whyItWorks: 'The Claude PowerPoint add-in works inside your deck. Use it to draft slide content, sharpen structure, or turn a wall of text into something presentable.',
    slots: ['CLIENT'],
    text: {
      all:      `Review this presentation and suggest improvements to the structure. Identify any slides that are doing too much, any gaps in the narrative, and rewrite the headline of each slide so it leads with the point rather than the topic.`,
      account:  `Draft a [CLIENT] quarterly review presentation. Include: performance vs. objectives, key wins, challenges and how we addressed them, priorities for next quarter, and one ask from the client. Keep each slide to one clear point.`,
      strategy: `Turn the key arguments from this document into a strategy presentation for [CLIENT]. Each slide should carry one strategic point. End with a clear recommendation slide and a "what we need to agree today" slide.`,
      creative: `Draft a creative presentation structure for the [CLIENT] campaign concepts. For each territory include: concept name, one-line idea, what it looks like in execution, and why it's right for the brief. Keep it visual — minimal text per slide.`,
      media:    `Build a campaign performance presentation for [CLIENT]. Slides should cover: overall summary, performance by channel, top-performing placements, what we'd do differently, and recommended next steps. Use simple charts where data is involved.`,
      pr:       `Draft a PR results presentation for [CLIENT]. Cover: campaign objectives, coverage highlights, total reach and sentiment, top 3 pieces of coverage, and what the results mean for the brand. One clear point per slide.`,
      social:   `Build a social performance review deck for [CLIENT]. Include: platform-by-platform performance, top content, engagement trends, audience growth, and three recommendations for the next period. Keep copy tight — let the numbers do the work.`,
      finance:  `Draft a finance review presentation covering: budget vs. actuals by project, margin summary, overspend flags, and a forward-looking risk slide. Each slide should have a clear headline that states the finding, not just the topic.`,
      web:      `Build a project status presentation for [CLIENT]. Cover: what's been delivered, what's in progress, what's blocked and why, upcoming milestones, and any decisions needed from the client. One slide per section, no more.`,
    },
  },
  s3_office_excel: {
    stage: 3,
    label: 'Analyse a spreadsheet',
    whyItWorks: 'The Claude Excel add-in reads your spreadsheet in context. Drop this in and get a plain-English read of what the data actually shows.',
    slots: ['CLIENT'],
    text: {
      all:      `Analyse this spreadsheet. Give me a plain-English summary of what the data shows, the top 3 things that stand out, and any obvious gaps or inconsistencies.`,
      account:  `Summarise the key numbers in this sheet that I'd need to report to [CLIENT] — what's performing, what's under, and what needs an explanation.`,
      strategy: `Analyse the data in this spreadsheet. Tell me what the top-line trends are, what's surprising, and what question this data can't answer that we probably need to ask.`,
      creative: `Review this production cost tracker. Tell me which projects are over budget, which are at risk, and what the average cost per deliverable type is.`,
      media:    `Analyse this campaign data. Give me spend vs. performance by channel, flag anything significantly over or under-indexing, and suggest one reallocation.`,
      pr:       `Analyse this coverage report. Summarise total reach, sentiment split, top 5 publications by volume, and flag any outlets with consistent negative coverage.`,
      social:   `Analyse this social performance data. Give me average engagement rate by platform, top 3 posts by reach, and one recommendation for what to do more of next month.`,
      finance:  `Review this financial spreadsheet. Tell me where we're over budget, where we're underspent, and calculate the current blended margin across all projects.`,
      web:      `Review this project tracking spreadsheet. Identify which tickets are overdue, which are blocked, and give me a count of open items by assignee.`,
    },
  },

  s3_live_artifact: {
    stage: 3,
    label: 'Build me a Live Artifact',
    badge: 'live',
    whyItWorks: 'Run this in Cowork on the Claude desktop app — not in the web chat. Claude will build a persistent interactive HTML page saved to your Live Artifacts tab. Pre-filled with fictional data so you can see it working immediately. Once you have the relevant connector enabled, it can refresh from your real data automatically.',
    slots: [],
    text: {
      all:      `Build me a Live Artifact: a project status tracker for a marketing agency team. Track 6 active projects with these columns: project name, client, status (On Track / At Risk / Blocked — colour coded green, amber, red), owner, next milestone, due date, and a notes field. Make the status a clickable dropdown so I can update it directly. Add a summary header showing total projects and a count at each status. Pre-fill with realistic fictional data so I can see it working immediately.`,
      account:  `Build me a Live Artifact: a client account health dashboard for a senior account manager at a marketing agency. Track 6 client relationships with: client name, health status (Healthy / Needs Attention / At Risk — colour coded green, amber, red), last contact date, open actions count, next key date, and a notes field. Make the health status updatable by clicking. Add a summary bar at the top showing total accounts, how many need attention, and total open actions. Pre-fill with realistic fictional client data — once I connect Google Drive, this can pull open actions directly from my contact reports.`,
      strategy: `Build me a Live Artifact: a strategic brief tracker for a planning team at a marketing agency. For each brief track: client, brief title, core strategic question, hypothesis, quality score (1–5, editable), status (Exploring / In Progress / Final — colour coded), and owner. Add a summary header showing briefs at each status and average quality score. Pre-fill with 5 fictional briefs across different sectors so I can see it working immediately.`,
      creative: `Build me a Live Artifact: a creative production tracker for a creative team at a marketing agency. Track 8 active deliverables: project name, client, deliverable type, creative lead, current stage (Brief / Concept / Development / Amends / Final / Delivered — colour coded), due date, and a blocked flag. Make the stage selector and blocked flag interactive. Add a header bar showing how many projects are at each stage. Pre-fill with realistic fictional creative projects so I can see it working immediately.`,
      media:    `Build me a Live Artifact: a Meta Ads campaign performance dashboard for a media planning team at a marketing agency. Track 6 live campaigns with: campaign name, client, spend to date, budget remaining (auto-calculated), reach, clicks, ROAS, and performance status (Ahead / On Track / Behind / Paused — colour coded). Make the status field editable. Add a totals row and a callout showing total spend vs total budget and blended ROAS. Pre-fill with realistic fictional campaign data — once I connect Meta Ads, this can refresh automatically from my live campaigns.`,
      pr:       `Build me a Live Artifact: a press coverage tracker for a PR team at a marketing agency. Log coverage hits with: date, publication, journalist, headline, coverage type (Feature / Mention / Interview / Review), sentiment (Positive / Neutral / Negative — colour coded), estimated reach, and whether coverage was proactive or reactive. Add a summary header showing total hits, total reach, sentiment split, and top 3 publications by hit count. Make sentiment and type fields updatable. Pre-fill with 10 realistic fictional hits for a brand launch — once I connect Google Drive, this can pull from my coverage reports automatically.`,
      social:   `Build me a Live Artifact: a content performance tracker for a social media manager at a marketing agency. Track posts across platforms: platform (Instagram / TikTok / LinkedIn / X), post type, publish date, brief description, reach, engagement rate, and performance rating (Standout / Solid / Underperformed — colour coded). Make the performance rating interactive. Add a per-platform summary showing average engagement rate and total reach. Pre-fill with 12 realistic fictional posts spread across all four platforms so I can see it working immediately.`,
      finance:  `Build me a Live Artifact: a project profitability tracker for a finance manager at a marketing agency. Track 8 active projects: project name, client, agreed fee, estimated cost, actual cost to date, projected final cost, current margin % (auto-calculated), and an over-budget flag. Highlight rows where margin is below 20% in amber and below 10% in red. Add a summary row with total fee, total cost, and blended margin. Make cost fields editable. Pre-fill with realistic fictional data showing a mix of healthy, tight, and over-budget projects — once I connect SharePoint, this can pull directly from my budget files.`,
      web:      `Build me a Live Artifact: a sprint board for a development team at a digital agency. Track tickets across four columns — Backlog, In Progress, In Review, Done. Each ticket shows: ID, title, assignee, size (S / M / L / XL), and priority (High / Medium / Low — colour coded). Let me move tickets between columns via a status selector on each card. Add a header showing total tickets, in-progress count, and sprint completion percentage. Pre-fill with 14 realistic fictional tickets across a web build project so I can see it working immediately.`,
    },
  },

  // ============================================================
  // STAGE 4 — PROMPT LIKE A PRO
  // ============================================================
  s4_role: {
    stage: 4,
    label: 'Give it a role, not just a task',
    whyItWorks: 'Telling Claude *who* it is changes how it thinks, not just what it produces.',
    slots: ['CLIENT'],
    text: {
      all:      `You are a senior strategist at [AGENCY]. I'm going to share [CLIENT]'s brief. Identify the three biggest strategic risks before we start work, and what we'd need to mitigate each.`,
      account:  `You are a senior account director at [AGENCY]. Read this [CLIENT] brief and tell me what's missing — the questions I should go back to the client with before we accept the work.`,
      strategy: `You are a senior strategist at [AGENCY]. Read [CLIENT]'s brief and pressure-test it. Tell me where the logic breaks, what the real audience tension probably is, and what I should challenge.`,
      creative: `You are a creative director at [AGENCY]. Read [CLIENT]'s brief and tell me three angles that would make this campaign feel earned, not generic. Pick the one with the most potential.`,
      media:    `You are a senior media planner at [AGENCY]. Read [CLIENT]'s brief and tell me where the proposed channel mix is wrong. Be specific.`,
      pr:       `You are a senior PR director at [AGENCY]. Read [CLIENT]'s brief and tell me what the news angle actually is — the version that would get coverage outside trade press.`,
      social:   `You are a senior social strategist at [AGENCY]. Read [CLIENT]'s brief and tell me what the post would look like on TikTok vs LinkedIn vs Instagram, and which platform we should ignore.`,
      finance:  `You are a senior finance manager at [AGENCY]. Read this [CLIENT] budget or financial report and tell me where we're exposed — the variances or risks I should flag before the next review.`,
      web:      `You are a senior developer at [AGENCY]. Read this [CLIENT] brief and tell me what's technically underspecified — the assumptions that will break the build if we don't challenge them now.`,
    },
  },
  s4_examples: {
    stage: 4,
    label: 'Use examples to set the standard',
    whyItWorks: 'One real example beats five sentences of description. Claude reverse-engineers your house style.',
    slots: [],
    text: {
      all: `Here's an example of a deliverable we wrote last quarter that I was happy with:

[PASTE EXAMPLE]

Now write the same thing for the following project, matching the format, tone, and level of detail exactly:

[PASTE NEW PROJECT DETAILS]`,
    },
  },
  s4_think: {
    stage: 4,
    label: 'Give Claude room to think',
    whyItWorks: 'For complex, high-stakes decisions, slowing Claude down produces better answers. Use it when the problem has multiple variables — skip it for simple tasks.',
    slots: ['CLIENT'],
    text: {
      all:      `Before you respond, think through the key considerations for [CLIENT]'s situation — the tensions, the trade-offs, what you'd need to know to be more certain. Then give me your recommendation. I want to see your reasoning, not a polished answer that skips it.`,
      strategy: `Before you respond, map out the strategic tensions in [CLIENT]'s brief — what's pulling in different directions, where the brief makes assumptions, and what the real problem might actually be. Then give me your recommendation.`,
      media:    `Before you respond, think through the audience, channel, and timing considerations for [CLIENT]'s campaign. Flag any assumptions you're making. Then give me your channel recommendation.`,
      finance:  `Before you respond, think through the financial risks and variances in [CLIENT]'s situation — what's driving them and what might be masking a bigger issue. Then give me your recommendation.`,
      web:      `Before you respond, think through the technical risks and dependencies in [CLIENT]'s brief — what could go wrong, what's underspecified, and what decisions need to be made before development starts. Then give me your recommendation.`,
    },
  },
  s4_format: {
    stage: 4,
    label: 'Specify the output, not just the task',
    whyItWorks: 'Telling Claude exactly what to give back — structure, length, format — cuts revision time in half. The vaguer the ask, the longer the answer.',
    slots: [],
    text: {
      all:      `[DESCRIBE YOUR TASK HERE]. Give me: (1) a two-sentence summary of the key insight, (2) three bullet points with specific actions, and (3) a one-line recommendation I can paste into an email. No more than 200 words total.`,
      account:  `[DESCRIBE YOUR CLIENT SITUATION]. Give me: (1) a one-paragraph status summary, (2) three bullet points of risks or decisions needed, and (3) a one-line suggested next action. Keep it under 150 words.`,
      strategy: `[DESCRIBE THE BRIEF]. Give me: (1) the core tension in one sentence, (2) three strategic territories as headlines only, and (3) a single recommended direction with a one-sentence rationale.`,
      creative: `[DESCRIBE THE BRIEF]. Give me five creative territories. For each: a name (2–4 words), a one-sentence concept, and one execution idea. Nothing else.`,
      media:    `[DESCRIBE THE CAMPAIGN]. Give me a channel recommendation in this format — Channel | Rationale | Budget priority (High/Med/Low). Three to five channels max.`,
      pr:       `[DESCRIBE THE STORY]. Give me: (1) the news angle in one sentence, (2) three target publications with a one-line pitch for each, and (3) one risk to flag.`,
      social:   `[DESCRIBE THE CAMPAIGN]. Give me three post options for [PLATFORM]. For each: the hook (first line), the body (2–3 sentences), and a CTA. Label them Option A, B, C.`,
      finance:  `[DESCRIBE THE FINANCIAL DATA OR SITUATION]. Give me: (1) the headline variance in one sentence, (2) three bullet points of risks or decisions needed, and (3) a one-line recommendation for the finance review. Under 150 words.`,
      web:      `[DESCRIBE THE TECHNICAL TASK OR CODE ISSUE]. Give me: (1) what's wrong or what's needed in one sentence, (2) the fix or approach in three bullet points, and (3) any risks or dependencies to flag. Under 200 words.`,
    },
  },
  s4_refine: {
    stage: 4,
    label: "Steer the response, don't start a new chat",
    whyItWorks: 'Claude learns within a conversation. Refining is faster than starting over.',
    slots: [],
    text: {
      all: `That's close — but make it 30% shorter, lead with the audience benefit, and cut anything that sounds like a process description. Try again.`,
    },
  },
  s4_combined: {
    stage: 4,
    label: 'A pro-level prompt',
    whyItWorks: 'Combines role + reasoning room + output format. Every element is doing work. Use this on a real brief you have open right now.',
    slots: ['CLIENT'],
    text: {
      all:      `You are a senior strategist at [AGENCY]. Before you respond, think through the tensions and trade-offs in [CLIENT]'s brief. Then give me: (1) the three biggest strategic risks, (2) what's missing or ambiguous, and (3) a one-paragraph recommendation. Lead with the most important point. No more than 300 words.`,
      account:  `You are a senior account director at [AGENCY]. Before you respond, think through what [CLIENT] actually needs right now vs what they've asked for. Then give me: (1) the decisions we need from the client, (2) the risks we should flag, and (3) a draft email to the client — subject line included. Under 250 words.`,
      strategy: `You are a senior strategist at [AGENCY]. Before you respond, map the tensions in [CLIENT]'s brief and what the real problem might be. Then give me: (1) the core tension in one sentence, (2) three strategic territories as headlines, and (3) your recommended direction with a one-sentence rationale.`,
      creative: `You are a creative director at [AGENCY]. Before you respond, think through what would make this campaign for [CLIENT] feel earned rather than generic. Then give me: (1) three creative territories with names and one-sentence concepts, (2) the strongest one with two executions, and (3) what we'd need to make it real.`,
      media:    `You are a senior media planner at [AGENCY]. Before you respond, think through the audience, timing and channel tensions for [CLIENT]'s campaign. Then give me a channel plan in this format — Channel | Rationale | Budget priority (High/Med/Low). Four channels max.`,
      pr:       `You are a senior PR director at [AGENCY]. Before you respond, think through what would actually make this story newsworthy for [CLIENT]. Then give me: (1) the news angle in one sentence, (2) three outlets with a personalised one-line pitch for each, and (3) one risk to flag.`,
      social:   `You are a senior social strategist at [AGENCY]. Before you respond, think through what would make someone stop scrolling for [CLIENT]'s campaign. Then give me three post options for the lead platform. For each: hook (first line) · body (2–3 sentences) · CTA. Label them A, B, C.`,
      finance:  `You are a senior finance manager at [AGENCY]. Before you respond, think through what the numbers are actually telling you about [CLIENT]'s situation. Then give me: (1) the headline performance in one sentence, (2) the top three variances and what's driving them, and (3) a recommended action for the month-end review. Under 300 words.`,
      web:      `You are a senior developer at [AGENCY]. Before you respond, think through the technical risks and gaps in [CLIENT]'s brief. Then give me: (1) the three biggest technical risks, (2) what's missing from the spec, and (3) a recommended next step before development starts. Under 300 words.`,
    },
  },

  // ============================================================
  // STAGE 5 — BUILD AND AUTOMATE (SKILLS)
  // ============================================================
  s5_skill: {
    stage: 5,
    label: 'Let Claude build your Skill for you',
    whyItWorks: "You don't need to write a Skill from scratch — Claude interviews you and writes it.",
    slots: [],
    text: {
      all:      `Help me build a Claude Skill for a task I do every week at my [AGENCY]. Ask me one question at a time about: (1) the task, (2) what good looks like, (3) the inputs I usually have, (4) the format of the output, (5) anything that should always or never be done. Once you've got enough, draft the Skill instructions for me.`,
      account:  `Help me build a Claude Skill called "Weekly Status Note" for my client account. Ask me about my client, the format I use today, what stays the same each week, and what changes. Then draft the Skill.`,
      strategy: `Help me build a Claude Skill called "Strategic Response" using my preferred framework (Tension → Insight → Platform → Territories). Ask me how I usually structure each section, then draft the Skill.`,
      creative: `Help me build a Claude Skill called "Creative Territory Generator" that turns a brief into 5 territories with names, concepts and executions. Ask me about my preferred format, then draft it.`,
      media:    `Help me build a Claude Skill called "Channel Plan Reviewer" that sense-checks a media plan against an audience brief. Ask me what good looks like, then draft it.`,
      pr:       `Help me build a Claude Skill called "Press Release Drafter" using our standard structure and tone. Ask me what's fixed and what changes per release, then draft it.`,
      social:   `Help me build a Claude Skill called "Social Post Generator" that takes one campaign idea and produces platform-specific posts. Ask me about each platform's voice, then draft it.`,
      finance:  `Help me build a Claude Skill called "Month-End Commentary Writer" that turns variance data into plain-English finance commentary. Ask me about my reporting format and what good commentary looks like, then draft it.`,
      web:      `Help me build a Claude Skill called "Technical Brief Reviewer" that identifies gaps and risks in development briefs before estimation begins. Ask me what I always need answered before I can scope a project, then draft it.`,
    },
  },
  s5_finale: {
    stage: 5,
    label: 'Find your three biggest unlocks',
    whyItWorks: 'Closes the pathway with a personalised, action-oriented prompt — turning learning into a plan.',
    slots: [],
    text: {
      all: `Based on everything I've learned about Claude in this onboarding, what are the three highest-impact ways I should be using it in my day-to-day work at [AGENCY]? Ask me a few questions about my role and a typical week first, so your answer is specific to me — not generic. Finish with one habit I should adopt this week.`,
    },
  },
};

const SLOT_DEFAULTS = { AGENCY: 'a Miroma agency' };

function cpFillTemplate(text, slotValues) {
  return text.replace(/\[([A-Z_]+)\]/g, (_, name) => {
    const v = slotValues[name];
    if (v && v.trim()) return v.trim();
    if (SLOT_DEFAULTS[name]) return SLOT_DEFAULTS[name];
    return `[${name}]`;
  });
}

Object.assign(window, { CP_ROLES: ROLES, CP_PROMPTS: PROMPT_LIBRARY, CP_SLOT_DEFAULTS: SLOT_DEFAULTS, cpFillTemplate });

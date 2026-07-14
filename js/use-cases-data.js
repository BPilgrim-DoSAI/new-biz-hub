/* =============================================
   USE CASES DATA
   Each entry: title, category, tool, description, type ('prompt'|'workflow'), prompt|steps, video
   ============================================= */

const USE_CASES = [

  // ── NEW BUSINESS & STRATEGY ───────────────────────────

  {
    title: 'Run the full new business workflow',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'A seven-phase prompt chain covering every step from prospect entry to pitch-ready deck. Each phase feeds the next — client research, call briefing, brief summary, case study selection, Springboards positioning, and RFP response — with structured validation questions between each stage to catch gaps before they compound.\n\nFill in the variables at each phase and run them in order. You can run phases as separate Claude conversations or chain them in one session.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'agency_name', label: 'Agency name' },
      { id: 'industry', label: 'Industry / category' },
    ],
    prompt: `# New Business Workflow Prompt

> Fill in the {{VARIABLES}} at each phase. Run phases in order. Each phase feeds the next.

---

## Phase 1: Client Research

You are a market research analyst for a marketing agency.

Research {{client_name}} and their competitive landscape in {{industry}}.

Produce a structured dossier covering:

1. Company profile: founding, ownership, latest revenue or market status, five-year growth trajectory.
2. Market presence: share, availability, price positioning.
3. Target audience and recent campaign activity.
4. Competitor ranking table: list the top {{NUMBER_OF_COMPETITORS, default: 10}} competitors with a one-line summary of each brand's positioning.
5. For each competitor, cover: market share, recent launches, campaign highlights, and any notable strategic shifts.

Focus on {{MARKET/REGION, default: UK}}.

Format as a briefing document with clear headers. No preamble.

BEFORE HANDING OFF TO PHASE 2, ask the user:
1. Are any competitors missing from this list that you already know about or expect to see?
2. Are there specific competitor campaigns or launches you want covered in more detail?
3. Is the market scope right, or should we narrow to a sub-category or widen to adjacent markets?
4. Does the client's positioning summary match what you have heard from them directly?
5. Are there any confidential data points (e.g. pitch intel, internal pricing) that should be added manually before this moves forward?

---

## Phase 2: Call Notes & Briefing

You are preparing a briefing document for a pitch team.

Using the following inputs, produce a concise pre-call (or post-call) briefing:

Client research summary:
{{PASTE_RESEARCH_OUTPUT_FROM_PHASE_1}}

Client documents (if any):
{{PASTE_OR_ATTACH_CLIENT_DOCS}}

Call notes or transcript:
{{PASTE_CALL_NOTES_OR_FIREFLIES_TRANSCRIPT}}

The briefing should cover:
- Business context and recent news or milestones
- Known pain points
- Strategic objectives or interests inferred from available sources
- Key decisions made during the call (if post-call)
- Open questions and agreed next steps

Keep it to one page. Write for someone joining the pitch team cold.

BEFORE HANDING OFF TO PHASE 3, ask the user:
1. Were any pain points or priorities discussed in the call that are not reflected here?
2. Is there anything the client said that contradicts what the research suggested?
3. Are there internal politics or sensitivities at the client that should shape how we pitch?
4. Who from our side will lead the relationship, and does the briefing need to be tailored for their knowledge level?
5. Are there any follow-up actions from the call that need completing before the pitch moves forward?

---

## Phase 3: Brief Summary

Summarise the following client brief into a single-page overview.

Full brief:
{{PASTE_FULL_CLIENT_BRIEF}}

Cover the following, in this order:
1. Key requirements (what the client wants delivered)
2. Key dates and deadlines
3. Budget range (if stated)
4. Context and background
5. Core problem statement
6. Key people and stakeholders
7. Questions arising from the brief (flag gaps, contradictions, or missing information)

Be direct. Flag anything unclear. No filler.

BEFORE HANDING OFF TO PHASE 4, ask the user:
1. Does this summary accurately reflect what the client is asking for, or have any requirements been misread?
2. Are the flagged questions and gaps things we should raise with the client before pitching, or work around?
3. Is the budget range realistic for the scope described, or does it signal we need to propose a phased approach?
4. Are there any deliverables or channels the brief does not mention that we should proactively recommend?
5. Who on the client side is the real decision-maker, and does the brief make that clear?

---

## Phase 4: Case Study Selection

You have access to the following case study library:
{{CASE_STUDY_SOURCE}}

Based on this brief summary:
{{PASTE_BRIEF_SUMMARY_FROM_PHASE_3}}

Select {{NUMBER_OF_CASE_STUDIES, default: 3-5}} case studies that best match the client's:
- Industry or category
- Target audience
- Channels (e.g. social, OOH, digital, experiential)
- Problem type (e.g. brand launch, repositioning, performance)

For each, state:
- Case study title
- Why it matches this brief (one sentence)
- The key result or proof point

Rank by relevance. If no strong match exists for a criterion, say so.

BEFORE HANDING OFF TO PHASE 5, ask the user:
1. Do any of these case studies feel like a stretch, or would you swap any for a stronger example?
2. Are there recent wins or live projects not yet in the library that should be included instead?
3. Does the client care more about creative quality, measurable results, or strategic thinking?
4. Are any of the selected case studies for clients who compete with or conflict with the prospect?
5. Should we include a case study from a different agency in the group if it is a stronger match?

---

## Phase 5: Springboards

Using the inputs below, produce a complete Springboards document for this pitch. Output it as a single file with two sections.

Client name: {{client_name}}
Agency: {{agency_name}}
Date: {{DATE}}

Client research summary:
{{PASTE_RESEARCH_OUTPUT_FROM_PHASE_1}}

Brief summary:
{{PASTE_BRIEF_SUMMARY_FROM_PHASE_3}}

Selected case studies:
{{PASTE_CASE_STUDIES_FROM_PHASE_4}}

SECTION 1: SPRINGBOARDS FIELDS

Complete each field. Be sharp. Each should be usable as-is by a creative team.

1. Main product or service: What is being sold, in one sentence.
2. Single-minded proposition / Positioning: The core message or unique angle.
3. Tone: e.g. authoritative, playful, urgent, warm. One or two words.
4. Audience: Who the work is aimed at. Be specific.
5. Reasons to believe: Proof points, benefits, or evidence that support the proposition.

SECTION 2: CONSOLIDATED POSITIONING STATEMENT

Write a clean paragraph (not bullet points) that weaves together the product, proposition, tone, audience, and reasons to believe into a coherent positioning statement. This will feed directly into the RFP response draft.

BEFORE HANDING OFF TO PHASE 6, ask the user:
1. Does the single-minded proposition feel true and distinct, or does it read like it could apply to any agency?
2. Is the tone right for this client?
3. Are the reasons to believe strong enough to survive scrutiny in the room?
4. Does the positioning statement read as something the creative team can actually brief from?
5. Is there anything the client specifically asked to hear in the pitch that this positioning does not yet address?

---

## Phase 6: RFP Response Deck

You are building an RFP response deck for {{agency_name}} pitching to {{client_name}}.

Using the following inputs, produce a tailored pitch deck outline:

Agency design template: {{AGENCY_TEMPLATE_PATH}}
Client research: {{PASTE_RESEARCH_OUTPUT_FROM_PHASE_1}}
Call notes / briefing: {{PASTE_BRIEFING_FROM_PHASE_2}}
Brief summary: {{PASTE_BRIEF_SUMMARY_FROM_PHASE_3}}
Selected case studies: {{PASTE_CASE_STUDIES_FROM_PHASE_4}}
Springboards document: {{PASTE_OR_ATTACH_SPRINGBOARDS_FROM_PHASE_5}}
Previous RFP responses (if available): {{PASTE_OR_REFERENCE_PREVIOUS_RFPS}}

DECK STRUCTURE

Build the following slides:

1. Title slide: {{agency_name}} × {{client_name}}, date, subtitle.
2. Understanding the challenge: the client's problem in their language, drawn from the brief summary.
3. Market context: competitor landscape and positioning from Phase 1. Include a ranking table or chart.
4. Our approach: strategic framework and how the agency will solve the problem.
5. Case studies: one slide per selected case study with key result and proof point.
6. Creative positioning: the Springboards proposition, tone, and audience.
7. Team and ways of working: who will deliver, how the relationship works.
8. Timeline and next steps: key dates, milestones, and what happens after the pitch.

Add or remove slides as the content demands. {{ESTIMATED_SLIDE_COUNT, default: 10-15}} slides total.
Write in {{TONE, default: confident, clear, direct}}.

---

## Phase 7: Senior Review (Manual)

Route the Phase 6 output to {{SENIOR_REVIEWER}} for feedback. Incorporate edits and re-run Phase 6 if needed.

---

## Variables Index

| Variable | Description | Used in |
|---|---|---|
| CLIENT_NAME | Prospect company name | 1, 5, 6 |
| INDUSTRY/CATEGORY | Client's market or sector | 1 |
| MARKET/REGION | Geographic focus (default: UK) | 1 |
| NUMBER_OF_COMPETITORS | How many competitors to cover (default: 10) | 1 |
| CASE_STUDY_SOURCE | Where case studies live | 4 |
| NUMBER_OF_CASE_STUDIES | How many to select (default: 3-5) | 4 |
| AGENCY_NAME | Which Miroma agency is pitching | 5, 6 |
| DATE | Date for the Springboards document | 5 |
| AGENCY_TEMPLATE_PATH | Path to the agency's master .pptx template | 6 |
| TONE | Voice for the proposal (default: confident, clear, direct) | 6 |
| ESTIMATED_SLIDE_COUNT | Target number of slides (default: 10-15) | 6 |
| SENIOR_REVIEWER | Who reviews the draft | 7 |`,
    video: null,
  },

  {
    title: 'Draft a campaign brief at speed',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Feed Claude the raw context — client emails, meeting notes, a media plan extract — and get back a structured brief with every field either sourced from the inputs or flagged with an explicit question. No guessing, no invented brief sections.\n\nParticularly useful when you\'re under time pressure after a client call and need a clean brief to align the team before the day is out.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `You are an account manager writing a creative brief for {{agency_name}} using the standard brief template.

Source materials (paste in full):
- Client emails: [PASTE EMAIL THREAD]
- Meeting notes: [PASTE MEETING NOTES]
- Media plan extract: [PASTE IF AVAILABLE]
- Booked media: [PASTE BOOKED MEDIA SUMMARY]
- Previous round of creative (if iteration): [PASTE PRIOR CREATIVE NOTES]

Method:

Step 1. Read every input. Build a working list of every concrete requirement mentioned: deadlines, formats, mandatories, audience descriptors, tone hints.
Step 2. For each brief field below, find the supporting evidence in the source material. Quote or paraphrase tightly.
Step 3. For the audience field: do not stop at demographics. Look for one insight (a need, a tension, a behaviour) somewhere in the source.
Step 4. For the proposition: cut until under 15 words. If you cannot get there, the proposition is not yet sharp enough; flag it.
Step 5. For tone of voice: do not invent. If the client has expressed it, quote them. If they have not, mark [TONE NEEDS CONFIRMATION].
Step 6. Self-check: every field either has source-backed content or a [NEEDS INPUT: <question to ask>] flag. No invention.

Brief structure to fill:
1. Client and project
2. Background and context (60 words)
3. Objective (one sentence, measurable)
4. Target audience (with one insight, not just demographics)
5. Single-minded proposition (under 15 words)
6. Reasons to believe (max 3)
7. Mandatories (legal, brand, technical)
8. Deliverables (formats, dimensions, deadlines from the media plan)
9. Tone of voice
10. Success metrics
11. Open questions for the client

Constraints:
- Use only information present in the source material
- For any field with no evidence, write [NEEDS INPUT: <question to ask>]
- Do not infer the client's brand voice; quote it from prior creative if available`,
    video: null,
  },

  {
    title: 'Explore creative territory for any brief',
    category: 'Creative & Production',
    tool: 'Springboards',
    description: 'Springboards is built to push past the obvious. Feed it a brief and it generates a wide range of creative sparks — directions, angles, and ideas you might not land on alone. The Randomness Bar pushes outputs further into unexpected territory when you want to test the edges of a brief.\n\nUse it at the start of a project to map the creative landscape before the team commits to a direction.',
    type: 'workflow',
    steps: [
      'Create a new session in Springboards and set up a Brand Profile with your client\'s context, tone, and audience.',
      'Input your creative challenge or brief as the starting point.',
      'Generate an initial set of sparks and review the range of directions Springboards surfaces.',
      'Adjust the Randomness Bar to push into more unexpected territory and test the edges of the brief.',
      'Pin the strongest directions to your Canvas and group them by theme or angle.',
      'Share the session with your team and use Chat to refine and build on the most promising directions.',
      'Use the output as the starting point for the first internal creative review.',
    ],
    video: null,
  },

  {
    title: 'Synthesise competitor research instantly',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Competitive analysis used to mean hours of reading, tabbing between browser windows, and manually building a spreadsheet. Paste competitor content, ads, and positioning into Claude and get a structured landscape document that identifies patterns, gaps, and opportunities — in the time it takes to make a coffee.\n\nEspecially useful when you\'re on-boarding a new client and need to get smart fast.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `I'm working at {{agency_name}} on the {{client_name}} account. I'm going to share competitor content, ads, and positioning statements. Please analyse everything and produce a structured competitive landscape document with the following sections:

1. Brand Positioning Summary (one short paragraph per competitor)
2. Key Messages & Themes (what each brand is saying and to whom)
3. Visual & Tone Patterns (what the creative territory looks like)
4. Apparent Target Audience (who they seem to be going after)
5. Channels & Formats (where and how they show up)
6. Gaps & Opportunities (what no one is owning that we could)

Be specific and direct. Avoid vague observations — flag concrete things we can act on.

Competitor content:
[PASTE WEBSITE COPY, ADS, SOCIAL POSTS, PRESS ETC.]`,
    video: null,
  },

  {
    title: 'Draft press releases and media pitches',
    category: 'PR & Communications',
    tool: 'Claude',
    description: 'Getting coverage starts with a tight press release and a pitch that actually speaks to what each journalist cares about. Claude can produce both from a simple brief — structured correctly, written to the right length, and tailored by outlet type.\n\nParticularly useful for teams without a dedicated PR writer, or when you need multiple personalised pitches quickly for a campaign launch.',
    type: 'prompt',
    variables: [
      { id: 'spokesperson_name', label: 'Spokesperson name' },
      { id: 'spokesperson_title', label: 'Spokesperson title' },
    ],
    prompt: `Please write two things:

1. A press release (approx. 400 words, inverted pyramid structure, includes a quote placeholder attributed to {{spokesperson_name}}, {{spokesperson_title}})

2. Three personalised journalist pitches (100 words each), each tailored to one of the publication types listed below — lead with what's relevant to their readers, not just what we want to say.

News / announcement:
[DESCRIBE THE NEWS]

Our angle / why it matters:
[EXPLAIN THE ANGLE]

Target publication types:
- [e.g. National business press]
- [e.g. Trade/industry title]
- [e.g. Consumer lifestyle]`,
    video: null,
  },

  {
    title: 'Pressure-test a brief before presenting it',
    category: 'New Business & Strategy',
    tool: 'Springboards',
    description: 'A concept that hasn\'t been challenged is a concept that might fall apart in the room. Use Springboards to stress-test your idea — generating alternatives, identifying where your territory feels familiar, and sharpening what makes your direction genuinely distinctive.\n\nRun this before presenting a creative direction to a client or senior stakeholder.',
    type: 'workflow',
    steps: [
      'Create a new session and input your creative concept or brief as the challenge.',
      'Generate a wide range of alternative directions for the same brief — look for what else is possible.',
      'Compare your idea against the alternatives and note what makes it genuinely distinctive.',
      'Adjust the Randomness Bar to surface directions you wouldn\'t have considered — check if any are stronger than your current concept.',
      'Use Chat to interrogate the concept conversationally — ask Springboards to argue against it or identify where it feels familiar.',
      'Sharpen your rationale or refine the concept based on what the alternatives reveal before you present.',
    ],
    video: null,
  },

  {
    title: 'Get a curated industry news digest',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Walking into a client call sharp on their industry is the difference between a trusted advisor and a vendor. Brief Claude on the client\'s sector and get a structured roundup of the most relevant news, trends, and developments — ready to scan before a weekly call or drop into a status update.\n\nAlso useful for building cultural context when starting work on a new account.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'industry_sector', label: 'Industry / sector' },
    ],
    prompt: `Please compile a structured industry news digest for {{client_name}} in the {{industry_sector}} sector.

Format it with these sections:

1. Top 5 News Stories (most significant developments from the past [week/month])
2. Emerging Trends to Watch (2–3 things gaining momentum)
3. Competitor & Market Moves (any notable activity from key players)
4. Cultural Moments (relevant cultural events, conversations, or shifts)
5. So What? (2–3 bullet points on what this means for our client's marketing strategy)

Keep it scannable — headlines, 2-sentence summaries, and clear "why it matters" notes for each item.

Industry / sector: {{industry_sector}}
Client focus area: [e.g. sustainability, luxury, B2B SaaS, entertainment]
Time period to cover: [e.g. past 2 weeks]`,
    video: null,
  },

  {
    title: 'Draft research-quality surveys in minutes',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'A well-designed survey starts with a clear objective, neutral language, and the right mix of question types. Claude applies research best practice to produce a polished first draft — Likert scales, multiple choice, and open-ended questions — that you can deploy straight into your survey platform with minimal editing.\n\nSaves a full morning of drafting and avoids the classic pitfalls of leading or ambiguous questions.',
    type: 'prompt',
    variables: [
      { id: 'survey_objective', label: 'Survey objective' },
      { id: 'target_respondent', label: 'Target respondent' },
    ],
    prompt: `Please draft a research survey based on the objective below. Follow research best practice — avoid leading questions, keep language neutral and jargon-free.

Include:
- An intro paragraph explaining the survey purpose to respondents (friendly, 3–4 sentences)
- 12–15 questions with a mix of: Likert scale (1–5 or 1–7), Multiple choice (with "Other" options where relevant), 2 open-ended questions
- A closing thank-you message

Survey objective:
{{survey_objective}}

Target respondent:
{{target_respondent}}

Key topics to cover:
[LIST THE MAIN AREAS YOU WANT TO EXPLORE]

Approximate length: [e.g. 5–7 minutes]`,
    video: null,
  },

  {
    title: 'Build a PPC campaign structure from a brief',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    description: 'Campaign setup is time-intensive and detail-heavy. Feed Claude a campaign brief and get back a full PPC structure — ad groups, keyword themes, headlines, descriptions, and bid strategy guidance — ready to QA and upload. Speeds up campaign setup significantly without sacrificing rigour.\n\nParticularly useful when onboarding a new client account or launching a product with a tight deadline.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
    ],
    prompt: `You are a paid search strategist building a campaign structure for {{client_name}}.

Landing page content:
[PASTE LANDING PAGE TEXT OR DESCRIBE THE PAGE]

Product or service: [DESCRIBE THE OFFER]
Audience: [DESCRIBE THE TARGET AUDIENCE]
Region and language: [e.g. UK, English]
Match types in scope: [e.g. phrase and exact]
Negative keyword categories: [e.g. competitor names, job seekers]
Known LP issues: [ANY KNOWN PROBLEMS WITH THE PAGE, OR "NONE"]

Method:

Step 1. Read the landing page. Identify the core themes the page actually supports: what topics does it answer well, what topics are mentioned but thin?
Step 2. For each theme, define an ad group. Tag the intent stage: awareness, consideration, conversion.
Step 3. Generate 10 to 15 seed keywords per ad group. Broad themes only — do not invent search volumes.
Step 4. Add ad-group-specific negatives based on the negative categories provided.
Step 5. Draft three ad copy variants per ad group. Headlines under 30 characters each, descriptions under 90 characters. No claims unsupported by the LP. No "best", "cheapest", "guaranteed" without LP proof.
Step 6. Score landing-page-to-ad-group fit H/M/L. For Low-fit groups, name the LP fix needed.
Step 7. Identify three keyword themes the LP does not currently support. Flag as opportunities (worth building LPs for) or warnings (do not bid until LP exists).

Output:
1. Theme-based ad group structure (5–10 ad groups), each with: theme name, intent stage, seed keywords, negatives
2. Three ad copy variants per ad group (headlines and descriptions, char-compliant)
3. Landing-page-to-ad-group fit (H/M/L) and what to fix on the LP if Low
4. Three keyword themes the LP does not support: opportunities or warnings

Constraints:
- Do not invent search volumes; flag for tool validation
- Headlines respect Google Ads character limits (30 char headlines, 90 char descriptions)
- No unsupported claims`,
    video: null,
  },

  {
    title: 'Research creative ideas and references for any brief',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Getting copy and creative teams past the blank page requires real substance. Brief Claude on the topic and research questions — and get back sourced findings with trend vs fad distinctions and clear so-whats. Every factual claim cites its source.\n\nUse it at the start of a project to accelerate the creative development phase and arrive at the first internal review with a stronger point of view.',
    type: 'prompt',
    variables: [
      { id: 'brief_topic', label: 'Brief topic' },
      { id: 'decision_context', label: 'Decision this research informs' },
      { id: 'time_horizon', label: 'Time horizon (e.g. next 12 months)' },
    ],
    prompt: `You are a strategist preparing a research brief for {{brief_topic}}.

Audience for the brief: [INTERNAL TEAM OR CLIENT]
Decisions the brief informs: {{decision_context}}
Time horizon: {{time_horizon}}

Research questions:
1. [QUESTION ONE]
2. [QUESTION TWO]
3. [QUESTION THREE]

[If web search is enabled] Search recent sources. Prefer original sources (publishers, primary research, official data) over aggregators. Cite every claim.

[If pasting sources] Source material:
[PASTE SOURCE EXTRACTS WITH URLS AND DATES]

Method:

Step 1. For each research question, identify the one or two most reliable sources that speak to it.
Step 2. Distinguish trend (durable signal, multiple sources, time depth) from fad (single source, short cycle, novelty-driven). Tag each finding accordingly.
Step 3. For each finding, write the so-what: what does this change for the audience's decision?
Step 4. Note where sources contradict each other. Do not paper over conflict.
Step 5. List three implications for the team's work and three open questions where the data is thin.
Step 6. Self-check: every factual claim has a citation. Every opinion is marked as inference.

Output:
- Executive summary (4 bullets, each leads with a finding not a topic)
- Findings against each research question (100 words per question, with citations)
- Three implications
- Three open questions

Constraints:
- Cite every claim. No source means no claim.
- UK English, active voice
- Distinguish trend (durable) from fad (under 6 months)`,
    video: null,
  },

  {
    title: 'Generate an artist licensing agreement from key terms',
    category: 'Legal',
    tool: 'Claude',
    description: 'Drafting a licensing agreement means carefully transferring the right figures and terms from several different source documents — and getting any of it wrong creates problems after signing. Give Claude the artist invoice, tax form, and engagement notes and it populates the agreement template accurately, noting exactly which source document each entry came from. Any conflicts between documents are flagged clearly for legal to resolve; gaps are named rather than filled in.\n\nAlways route the output to legal for review before any party signs.',
    type: 'prompt',
    variables: [
      { id: 'artist_name', label: 'Artist name' },
    ],
    prompt: `You are populating an artist licensing agreement template using verified source documents.

Template (with placeholder fields):
[PASTE TEMPLATE TEXT WITH ALL PLACEHOLDER FIELDS VISIBLE]

Source documents (paste in order):
- Artist invoice: [PASTE INVOICE TEXT — name, address, work description, fees, dates]
- Tax form (W-9, W-8BEN, or local equivalent): [PASTE TAX FORM TEXT]
- Engagement notes (scope, deliverables, usage rights, term, territory): [PASTE ENGAGEMENT NOTES]

Method:

Step 1. List every placeholder field in the template.
Step 2. For each field, search the source documents for a direct match. Record which document and which line.
Step 3. Where two source documents disagree on the same field, flag [CONFLICT: <field>] with both values shown.
Step 4. Where no source covers the field, leave it blank and add [NEEDS INPUT: <field>].
Step 5. Copy verbatim for: addresses, tax IDs, dates, legal names, fees. No transformation, no formatting changes.
Step 6. Do not summarise, paraphrase, or shorten any legal clause in the template.
Step 7. Build a provenance log: every filled field mapped to its source line.

Output:
1. Populated agreement (in template order, ready for Legal review)
2. Field provenance log (field → source → line)
3. Outstanding items list (every [CONFLICT] and [NEEDS INPUT] consolidated)

Artist: {{artist_name}}

The output must be reviewed by Legal before any party signs. Do not present this as final.`,
    video: null,
  },

  {
    title: 'Generate a curated Broadway show list instantly',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Building a Broadway business development pipeline means filtering dozens of upcoming productions to find the right fit for your agency. Give Claude your criteria and it evaluates upcoming shows against producer history, creative alignment, and timing — surfaces any conflicts with your existing client roster — and returns a ranked shortlist of ten with a recommended first-contact approach for each.\n\nParticularly useful when building a business development pipeline for entertainment, sponsorship, or experiential clients.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
      { id: 'time_horizon', label: 'Time horizon (e.g. next 12 months)' },
    ],
    prompt: `You are a business development strategist for {{agency_name}} reviewing the upcoming production landscape.

Time horizon: {{time_horizon}}
Genres in scope: [e.g. musicals, plays, immersive, family]
Regions: [e.g. West End, Broadway, touring UK]

Production data (from public sources or your own scrape — include name, opening date, producer, creative team, theatre, status):
[PASTE PRODUCTION DATA HERE]

Agency capabilities and signature work:
[DESCRIBE THE AGENCY'S KEY CAPABILITIES AND 2–3 RECENT RELEVANT PROJECTS]

Existing client list (to avoid conflicts):
[LIST CURRENT CLIENTS OR "NONE"]

Method:

Step 1. Filter productions by time horizon, genre, and region. Discard anything outside scope.
Step 2. For each remaining production, score fit on three dimensions: producer history (have they worked with similar agencies?), creative match (does our signature work fit this type?), timing (early enough to win, not so early the production may not happen?).
Step 3. Cross-check against the existing client list. Flag any production where a current client may object (rival show, same producer, conflicting territory).
Step 4. Rank top 10. For each, name: producer, creative team, opening date, why this is a fit, who on our team should make first contact.
Step 5. Identify five productions to deprioritise: weak fit, bad timing, or conflict.
Step 6. Look across the top 10 for a pattern: a genre clustering, a producer building a slate, a region heating up. One observation.
Step 7. For any data that looks stale or unverified, tag [VERIFY: <field>]. Do not invent contacts.

Output:
1. Top 10 productions ranked by fit and timing
2. Per production: producer, creative team, opening date, fit rationale, recommended first-contact person
3. Conflict watch list
4. Five productions to deprioritise with reason
5. One pattern observation`,
    video: null,
  },

  // ── CONTENT ──────────────────────────────────────────

  {
    title: 'Generate social content at scale',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Creating 20+ social post variations manually is one of the biggest time drains in content marketing. Give Claude the campaign idea, brand tone of voice, and platform requirements — and get a full set of on-brand post variations across LinkedIn, Instagram, and X in seconds.\n\nThe real value is in the variation: different angles, formats, and tones for different platforms, all grounded in the same campaign idea.\n\nNote: always review and edit AI output before use. For client social content, ensure use of AI has been agreed with the client in writing per Miroma\'s AI policy (§6.4). Do not include real client data, personal identifiers, or confidential information in the prompt.',
    type: 'prompt',
    variables: [
      { id: 'brand_name', label: 'Brand name' },
      { id: 'campaign_name', label: 'Campaign name' },
    ],
    prompt: `I need social media post variations for {{brand_name}}'s {{campaign_name}} campaign. Please write 20 posts across the three platforms specified — vary the angle, format, and tone for each.

For each post, specify:
- Platform (LinkedIn / Instagram / X)
- Format (e.g. caption, carousel hook, thread opener, story, short-form)
- The copy (including hashtags where appropriate)

Campaign idea:
[DESCRIBE THE CAMPAIGN CONCEPT]

Brand tone of voice:
[DESCRIBE TONE — e.g. confident, human, slightly dry, never corporate]

Key message:
[THE SINGLE THING EVERY POST SHOULD COMMUNICATE]

Call to action:
[WHAT SHOULD PEOPLE DO — e.g. visit link, share, comment]

Platforms: LinkedIn, Instagram, X
Mix of formats: captions, carousel hooks, thread openers`,
    video: null,
  },

  {
    title: 'Write email campaigns in minutes',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Brief Claude on your audience, product, tone, and goal and get a complete email campaign ready to drop into your sending platform. Not just body copy — subject lines, preview text, hero headline, and CTA included.\n\nGive it a good brief and the first draft is usually 80–90% there. Especially effective for product launches, event invitations, and retention campaigns.\n\nNote: review and edit all output before sending. For client email campaigns, confirm AI use has been agreed in writing per Miroma\'s AI policy (§6.4). Do not include personal data, real customer information, or confidential client data in the prompt.',
    type: 'prompt',
    variables: [
      { id: 'brand_name', label: 'Brand name' },
      { id: 'product_or_offer', label: 'Product / offer' },
    ],
    prompt: `Please write a complete email campaign for {{brand_name}} ready for deployment. Deliver every element in order:

1. Subject line (+ 2 alternative versions to A/B test)
2. Preview text (max 90 characters)
3. Hero headline (punchy, 8 words max)
4. Body copy (150–200 words — benefit-led, avoid jargon)
5. CTA button text (+ 1 alternative)
6. P.S. line (optional — use if there's a secondary message worth adding)

Campaign brief:
Audience: [DESCRIBE WHO IS RECEIVING THIS]
Product / offer: {{product_or_offer}}
Tone of voice: [e.g. warm and direct / premium / urgent but not pushy]
Primary goal: [e.g. click to landing page / register / purchase]
Key benefit to lead with: [THE MOST COMPELLING THING ABOUT THIS OFFER]
Any hard constraints: [THINGS TO INCLUDE OR AVOID]`,
    video: null,
  },

  {
    title: 'Create influencer briefs at scale',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Generic influencer briefs get generic content. Claude takes your campaign objectives and each creator\'s profile and generates a brief that feels written specifically for them — referencing their content style, audience, and voice — while staying consistent with the campaign.\n\nRun it once per creator. The personalisation is in the prompt, not in hours of manual writing.',
    type: 'prompt',
    variables: [
      { id: 'creator_name', label: 'Creator name' },
      { id: 'campaign_name', label: 'Campaign name' },
    ],
    prompt: `Please write a personalised influencer brief for {{creator_name}}. It should feel tailored to them — reference their content style and audience — while clearly communicating the campaign requirements.

Structure the brief as:
1. Why we chose them (2–3 sentences, specific to this creator)
2. Campaign overview (what it is and why it matters)
3. What we need from them (deliverables, format, quantity)
4. Key messages to communicate (3 bullet points max)
5. What to avoid
6. Brand guidelines summary (tone, visual do's and don'ts)
7. Deadlines and approval process
8. Fee and payment terms [PLACEHOLDER]

Campaign details:
Campaign name: {{campaign_name}}
Objective: [CAMPAIGN OBJECTIVE]
Key message: [CORE MESSAGE]
Deliverables: [e.g. 2 × Instagram Reels, 3 × Stories]
Campaign dates: [START AND END DATE]

Influencer profile:
Name: {{creator_name}}
Platform(s): [WHERE THEY POST]
Niche / content style: [DESCRIBE THEIR CONTENT]
Audience: [WHO FOLLOWS THEM]`,
    video: null,
  },

  {
    title: 'Refresh and optimise existing content for SEO',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Existing content that already ranks is often more valuable to optimise than writing from scratch. Upload what you have and Claude rewrites it for current search intent, improves structure, and incorporates target keywords — without losing the original voice or making it feel generic.\n\nParticularly effective for blog posts, service pages, and pillar content that\'s been live for 12+ months and is starting to slip in rankings.',
    type: 'prompt',
    variables: [
      { id: 'primary_keyword', label: 'Primary keyword' },
      { id: 'target_audience', label: 'Target audience' },
    ],
    prompt: `Please rewrite and SEO-optimise the following content. Keep the original voice and key messages intact, but make the structural and language improvements listed below.

Improvements to make:
1. Open with the primary keyword in the first 100 words, answering the search query directly
2. Restructure with a clear H1 and at least 4 descriptive subheadings (H2/H3)
3. Incorporate target keywords naturally — no stuffing
4. Shorten paragraphs to max 3 sentences for scannability
5. Add a clear meta description (max 155 characters) at the top
6. Flag any outdated facts, statistics, or references with [UPDATE NEEDED]

Primary keyword: {{primary_keyword}}
Secondary keywords: [2–3 RELATED KEYWORDS]
Target audience: {{target_audience}}
Search intent: [e.g. informational / commercial / transactional]

Original content:
[PASTE CONTENT HERE]`,
    video: null,
  },

  {
    title: 'Refine copy while keeping the brand voice intact',
    category: 'Creative & Production',
    tool: 'Claude',
    description: 'The difference between good copy and great copy is often a sharp editor. Claude acts as a final-pass editor — tightening language, sharpening the opening, and ensuring consistency in tone — while staying true to the brand voice you specify.\n\nIdeal for copy that\'s structurally right but needs polishing before it goes to the client for approval.',
    type: 'prompt',
    variables: [
      { id: 'brand_name', label: 'Brand name' },
      { id: 'brand_voice', label: 'Brand voice (e.g. warm but direct)' },
    ],
    prompt: `Please refine the following draft copy for {{brand_name}}. Your job is to sharpen the writing while keeping the brand voice and core message completely intact.

Specific edits to make:
1. Tighten the language — aim for 20% fewer words without losing meaning
2. Rewrite the opening line to hook the reader immediately
3. Ensure consistent tone throughout — flag any lines that feel off-brand
4. Improve the flow between paragraphs
5. Strengthen the closing line or CTA

Do not change: the core message, key claims, or specific terminology the brand uses.

Brand voice:
{{brand_voice}}

Target audience:
[WHO IS THIS FOR]

Purpose of this copy:
[e.g. homepage hero, email subject line, LinkedIn post, brochure intro]

Draft copy:
[PASTE COPY HERE]`,
    video: null,
  },

  // ── CREATIVE ─────────────────────────────────────────

  {
    title: 'Produce AI video content for campaigns',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'LTX Studio turns scripts and creative briefs into professional-quality video — ideal for concept videos, social reels, and client presentations where production speed matters more than a full shoot.\n\nUse it to get a polished first cut in front of stakeholders before any production budget is committed.',
    tutorialUrl: 'https://ltx.studio/blog/how-to-write-a-video-script-with-ai',
    type: 'workflow',
    steps: [
      'Define the video\'s purpose, target audience, desired action, platform, and length before writing anything. Be specific about what to exclude (off-brand tone, competitor references, etc.).',
      'Draft your script using Claude or LTX Studio\'s built-in script generator. Target ~150 words per 60 seconds. Read it aloud, cut filler, and sharpen the hook before moving on.',
      'Paste the script into LTX Studio\'s Script-to-Video tool. The AI maps each line to a scene and generates a storyboard automatically — review and adjust scene descriptions.',
      'Apply your Brand Kit (logos, colours, fonts) and generate visuals for each scene using the text-to-image and text-to-video tools. Iterate on any scenes that need adjustment.',
      'Arrange the sequence in the timeline editor. Use shot extension to lengthen clips. Add dialogue or voiceover using the Audio-to-Video feature if needed.',
      'Export in the required format. For client presentations, export at 1080p. For social, use platform ratios: 9:16 for Reels/TikTok, 16:9 for YouTube.',
      'Before sharing externally or using in client deliverables, confirm AI-generated content has been agreed with the client per Miroma\'s AI policy (§6.4), and disclose AI origin where required.',
    ],
    video: null,
  },

  {
    title: 'Edit a client podcast in 10 minutes',
    category: 'Creative & Production',
    tool: 'Descript',
    description: 'Descript turns audio editing into text editing. Upload your recording and the AI transcribes it automatically — then you edit the audio by editing the words on screen. Remove filler words, cut dead air, and restructure the episode without touching a timeline.\n\nIdeal for agencies producing client podcasts at volume or turning long-form interviews into clean, publishable episodes.',
    type: 'workflow',
    steps: [
      'Upload your audio or video recording to Descript. The AI transcription runs automatically — usually within a few minutes.',
      'Use the Filler Words tool (Action menu) to automatically detect and remove "um", "uh", "like", and other fillers in one click.',
      'Read through the transcript and delete any sections you want to cut — the audio is removed automatically.',
      'Use Remove Silence to clean up dead air and tighten the pacing without manual scrubbing.',
      'Add chapters, intros, and outros in the composition view.',
      'Export as MP3 for audio-only, or MP4 with waveform visualisation for social video.',
    ],
    video: null,
  },

  {
    title: 'Expand creative concepts at volume',
    category: 'Creative & Production',
    tool: 'Claude',
    description: 'A strong creative concept has more than one way to exist. Give Claude the core idea and it expands it into 15 distinct executional directions — varying tone, format, audience angle, and channel — in one session. Gets creative teams past the initial idea faster and pressure-tests the concept against multiple interpretations.\n\nUse it before the first internal creative review to arrive with options, not a single idea.',
    type: 'prompt',
    variables: [
      { id: 'brand_name', label: 'Brand name' },
      { id: 'campaign_objective', label: 'Campaign objective' },
    ],
    prompt: `Take the creative concept below and expand it into 15 distinct executional directions for {{brand_name}}.

For each direction:
1. Give it a short working title
2. Describe the idea in 2–3 sentences (specific, not vague)
3. Note the best channel / format for it (e.g. OOH, Instagram Reel, email, OOH, radio, etc.)
4. Note the primary audience it speaks to

Vary significantly across the 15: push some into unexpected territory, challenge assumptions, explore different tones. Don't just give us variations of the same idea with different visuals.

Core concept:
[DESCRIBE THE CENTRAL IDEA — WHAT IT IS AND WHAT IT'S SAYING]

Brand / client:
{{brand_name}}

Campaign objective:
{{campaign_objective}}

Target audiences to consider:
[LIST 2–3 AUDIENCE TYPES]`,
    video: null,
  },

  {
    title: 'Repurpose long-form video for social',
    category: 'Creative & Production',
    tool: 'Descript',
    description: 'A 60-minute webinar or interview contains dozens of shareable moments — but finding them manually takes hours. Upload to Descript, use the transcript to identify the strongest clips, and export vertical cuts for Reels, TikTok, and LinkedIn without touching a timeline.\n\nTurns a single production into a month\'s worth of social content.',
    type: 'workflow',
    steps: [
      'Upload your long-form video to Descript and wait for the transcript to generate.',
      'Use the Underlord "Find Clips" feature — describe what you\'re looking for (e.g. "most insightful moments", "strong quotes about [topic]") and it surfaces timestamps automatically.',
      'Review the suggested clips and mark your favourites. Adjust in/out points by editing the transcript text.',
      'Use Underlord to add captions, b-roll suggestions, and social-ready formatting to each clip.',
      'Use the Layouts tool to reframe each clip for vertical (9:16) format.',
      'Export each clip individually. Name them by platform (e.g. "ep12-clip1-instagram.mp4") for easy handoff.',
    ],
    video: null,
  },

  {
    title: 'Generate visual comps for pitch decks',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Presenting a creative concept at pitch stage no longer requires waiting on a designer or an external production team. LTX Studio generates photorealistic, brand-aligned visual comps in minutes — giving your pitch deck the visual quality it needs to win the room.\n\nParticularly effective when pitching to clients who respond to seeing ideas rather than reading them.',
    type: 'workflow',
    steps: [
      'Open LTX Studio and set up a new project. Load your brand pack if working on an existing client.',
      'Describe the visual concept in the text prompt: include scene, mood, lighting, style reference, and any brand elements (colours, products, people).',
      'Generate initial images and review. Iterate on the prompt — adjust composition, colour, and mood — until the visual matches the creative direction.',
      'Use the fine-tuning controls to adjust pose, lighting angle, and colour temperature.',
      'Export in high resolution and drop directly into your pitch deck slides.',
      'Create multiple visual directions (3–4 different concepts) to give the client options in the meeting.',
      'Disclose to the client that visuals are AI-generated concepts, not photography or finalised production assets. Per Miroma\'s AI policy, AI-generated outputs shared externally must be clearly identified as such.',
    ],
    video: null,
  },

  {
    title: 'Validate a sketch concept before production',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'A rough sketch or hand-drawn concept is hard to sell in a meeting. LTX Studio takes the sketch and generates a polished visual showing what the idea could look like in reality — bridging the gap between concept and execution at the proposal stage without committing production budget.\n\nUses the image-to-image feature to maintain the composition of your original sketch.',
    type: 'workflow',
    steps: [
      'Photograph or scan your sketch and upload it to LTX Studio as the reference image.',
      'Use the image-to-image tool — set the influence strength at around 60–70% to maintain composition while generating photorealistic output.',
      'Describe the final look in the prompt: materials, lighting, environment, style.',
      'Generate and iterate. Adjust the influence strength higher to stay closer to the sketch, lower to give the AI more creative freedom.',
      'Export the polished visual for use in your proposal or early creative presentation.',
    ],
    video: null,
  },

  {
    title: 'Upscale low-res images and retouch for delivery',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Legacy campaign imagery or supplied assets that don\'t meet spec can be rescued rather than replaced. LTX Studio\'s AI enhancement reconstructs detail intelligently — turning rough or low-resolution visuals into client-presentable assets without a reshoot.\n\nEspecially useful when repurposing older campaign imagery or working with supplied assets from third parties.',
    tutorialUrl: 'https://ltx.studio/blog/how-to-enhance-images-with-ai',
    type: 'workflow',
    steps: [
      'Before uploading, assess the source image honestly: heavy compression artefacts (blocky JPEG noise) or extreme blur are unlikely to be corrected well by AI upscaling — manage expectations or source a better original if possible.',
      'Upload the low-resolution or rough image to LTX Studio and select the Enhance tool.',
      'Choose your upscale factor (2× or 4×). AI enhancement reconstructs missing detail intelligently rather than simply scaling pixels — the result will look sharper and more defined than the original.',
      'Use the retouch tools to address any remaining issues: skin retouching, background clean-up, colour correction.',
      'QA the output at 100% zoom — check faces, text, and edges specifically, as these are where AI upscaling most commonly introduces artefacts.',
      'Export and check against the delivery spec (pixel dimensions, file size, format) before sending.',
    ],
    video: null,
  },

  {
    title: 'Generate images and video from a text prompt',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Describe the visual you need — scene, mood, style, subject — and generate a high-quality image or short video clip without briefing a photographer or production company. Speeds up concept development and gets ideas in front of stakeholders before any spend is committed.\n\nParticularly effective in early-stage creative development when you need to show, not tell.',
    tutorialUrl: 'https://ltx.studio/blog/how-to-create-ai-videos-with-images',
    type: 'workflow',
    steps: [
      'Open LTX Studio and choose "Text to Image" or "Text to Video" depending on your output need. For video, select your model: LTX-2.3 is the primary model for quality output; Kling and Veo 3.1 are also available and may suit specific styles.',
      'Write a detailed prompt: include subject, setting, mood, lighting style, colour palette, and any specific visual references.',
      'Set aspect ratio to match your intended output (16:9 for landscape, 9:16 for social vertical, 1:1 for square).',
      'Generate 4 initial outputs and review. Select the closest result and iterate by refining the prompt.',
      'For video: set clip duration (4–8 seconds is typical) and add motion direction to your prompt — be specific: "slow dolly in", "handheld camera", "pan left across the scene", "static shot with subject movement".',
      'Export your final output and brief the team on which direction to develop further.',
    ],
    video: null,
  },

  {
    title: 'Generate rapid mockups for brand visual development',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Exploring creative territory early — before any time has been invested in production — helps teams make better decisions faster. LTX Studio generates multiple visual directions for a brand identity or campaign key visual in minutes, letting teams pressure-test options with stakeholders before committing.',
    type: 'workflow',
    steps: [
      'Create a new project in LTX Studio and apply the client\'s Brand Kit if available.',
      'Generate 3–5 distinct visual directions using different prompt styles — vary mood, colour treatment, and compositional style significantly.',
      'For each direction, generate 2–3 variations to show range.',
      'Organise outputs into a comparison layout using LTX\'s export grid.',
      'Present to stakeholders for directional feedback — focus on "which world feels right" rather than final execution.',
      'Take the chosen direction forward for refinement and production-ready asset development.',
    ],
    video: null,
  },

  {
    title: 'Create photo comps for key art proposals',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Key art proposals that look like finished work win more easily than those that require imagination. LTX Studio composites photorealistic key art visuals for client proposals — presenting the creative vision in a production-ready way that gives clients the confidence to commit to a direction.',
    type: 'workflow',
    steps: [
      'Upload any reference images — product shots, location imagery — as source assets. Only include photography of real people (talent, cast, individuals) if you have explicit written consent from each person for their image to be processed by AI.',
      'Use LTX\'s compositing tools to place elements together: adjust scale, shadow, and perspective to make the composite feel real.',
      'Apply brand colours, typography placeholders, and any logo elements as overlay layers.',
      'Generate background environments or sky replacements using the text-to-image fill tool.',
      'Retouch the final composite for consistency — colour grade, sharpen, and ensure all elements feel like part of one image.',
      'Export at presentation quality and add to the key art proposal slides.',
    ],
    video: null,
  },

  {
    title: 'Generate storyboards from a script or concept',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Visual storyboards are essential for aligning a client or director to a creative vision before a shoot is committed to. LTX Studio\'s Storyboard Builder turns scripts and shot lists into a visual storyboard automatically — accelerating pre-production and reducing the back-and-forth before production sign-off.',
    tutorialUrl: 'https://ltx.studio/blog/how-to-write-a-video-script-with-ai',
    type: 'workflow',
    steps: [
      'If you don\'t have a script yet, write one first — either in LTX Studio\'s built-in script generator or with Claude. Target ~150 words per 60 seconds. Read it aloud before moving on to catch anything that doesn\'t work spoken.',
      'Open the Storyboard Builder in LTX Studio and paste in your script or shot list.',
      'The AI maps each scene or beat to a panel automatically. Review the suggested breakdowns and adjust scene descriptions.',
      'Generate visual panels for each scene using the scene-to-image tool — add shot type, camera angle, and mood to each prompt.',
      'Add dialogue or action notes below each panel.',
      'Rearrange panels as needed using the drag-and-drop board.',
      'Export as a PDF storyboard document ready to share with the client or director.',
      'When sharing with clients, make clear that visuals are AI-generated storyboard references, not final photography or production design. Disclose AI origin as required by Miroma\'s AI policy.',
    ],
    video: null,
  },

  {
    title: 'Generate video content from an audio track',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Audio-first productions — scripts, music tracks, voice-overs — often need a compelling visual layer for social distribution. LTX Studio\'s Audio-to-Video feature generates matching video visuals directly from your audio, creating social content without a dedicated shoot.',
    type: 'workflow',
    steps: [
      'In a project, open Gen Space and switch the output type to Video. From the video dropdown, select Audio-to-Video.',
      'Add your audio: record directly in the platform, generate dialogue using the built-in text-to-speech tool, or upload an existing file (MP3, WAV, AAC, OGG, MOV, or M4A — up to 20 seconds).',
      'Optionally upload an image to use as the character\'s opening frame.',
      'Write a scene direction prompt to guide the visuals. Add "character speaks" to the prompt if needed for clarity.',
      'Click Generate. The platform creates video where timing, motion, and performance align with your audio.',
      'Review the output and iterate on the scene direction prompt or swap the visual reference if the result needs adjustment.',
      'Set the aspect ratio to match your platform (9:16 for Reels/TikTok, 16:9 for YouTube) and export.',
    ],
    video: null,
  },

  {
    title: 'Fix a video scene without going back to set',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Reshoots are expensive and slow. LTX Studio\'s video retake feature lets you make targeted corrections to existing footage — adjusting an expression, swapping a background, correcting a moment — without returning to set. Significantly reduces turnaround time and cost on final delivery fixes.',
    type: 'workflow',
    steps: [
      'Upload the footage clip that needs correction to LTX Studio.',
      'Use the Video Retake tool to select the specific frame range that needs changing.',
      'Describe the correction in the prompt: "replace the background with an office interior", "adjust the expression to look more confident", etc.',
      'Generate the corrected version and compare against the original in split-screen.',
      'Blend the corrected section back into the original clip using the timeline editor.',
      'Export the corrected sequence and QA frame-by-frame before delivery.',
    ],
    video: null,
  },

  {
    title: 'Generate bespoke stock images on demand',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Generic stock imagery undermines campaign work. LTX Studio generates branded, on-brief imagery that actually matches the campaign aesthetic and brand guidelines — rather than settling for what\'s available in a library. No licensing fees, no searching, no compromising on the visual direction.',
    type: 'workflow',
    steps: [
      'Apply the client\'s Brand Kit in LTX Studio to establish the colour palette, style references, and visual constraints.',
      'Write a detailed prompt for the image you need: describe the subject, setting, lighting, ethnicity and demographics of any people, mood, and compositional style.',
      'Generate 4–6 options per image brief and select the strongest.',
      'Iterate on the selected image — adjust details, rerun specific elements using inpainting.',
      'QA against brand guidelines before use: check that nothing in the image conflicts with brand positioning.',
      'Export in the required specs for the placement (web, print, social) and add to the shared asset library.',
      'When using AI-generated imagery in client deliverables or external campaigns, confirm client approval has been obtained (Miroma AI policy §6.4) and disclose AI origin where required.',
    ],
    video: null,
  },

  {
    title: 'Generate consistent creative using brand packs',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'Campaign assets need to look like they belong together across dozens of deliverables. LTX Studio\'s brand packs — objects, cast, fonts, and colour palettes — keep generation outputs visually consistent at scale, so the 50th asset looks as on-brand as the first.',
    tutorialUrl: 'https://ltx.studio/blog/create-a-brand-consistent-ad-using-ltx-studio',
    type: 'workflow',
    steps: [
      'Before generating anything, define the brand style in writing: visual tone, what the campaign should feel like, and what to avoid. This becomes the foundation of every prompt you write.',
      'Set up the client Brand Kit in LTX Studio: upload logo, input brand colours (hex codes), upload brand fonts, and add any recurring visual elements.',
      'For product shots, use the Object Element feature to upload the actual product — this anchors product appearance across all generated outputs and prevents the model from inventing its own version.',
      'Create a cast of brand characters or models if required. If using real people as reference, you must have explicit written consent from each individual before uploading their images into any AI tool.',
      'Choose the right model for each output: LTX-2.3 Pro for hero shots and final-quality assets; LTX-2.3 Fast for rapid ideation and iteration rounds.',
      'For each deliverable, select the Brand Kit at the start of the generation and build your prompt within those constraints. Use the consistency lock feature for recurring characters or key visual elements.',
      'Run a brand consistency review across all generated assets before delivery — look for colour drift, font inconsistencies, and off-brand elements.',
      'Export a batch of assets in all required formats from the project.',
    ],
    video: null,
  },

  {
    title: 'Animate a still image into video',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'A strong photograph or key visual can become a dynamic video asset without a shoot. LTX Studio\'s image-to-video feature animates a still image using a motion prompt — ideal for social content, client presentations, and concept pitches where movement adds impact.',
    tutorialUrl: 'https://ltx.studio/blog/how-to-create-ai-videos-with-images',
    type: 'workflow',
    steps: [
      'Upload your base image to LTX Studio. It can be a photograph, AI-generated image, rendered key visual, or product shot — the higher the resolution, the better the result. If the image contains a real person, ensure you have their explicit written consent before uploading.',
      'Select "Image to Video" and choose your model: LTX-2.3 for cinematic quality output, Kling for stylised motion, or Veo 3.1 for a different aesthetic. Try more than one if you\'re unsure.',
      'Write a motion prompt that describes how the image should move. Be specific: "slow push in towards the subject", "gentle pan left", "dolly out to reveal the environment", "camera tilts up, subject stays static". Include a time reference like "over 6 seconds" to guide pacing.',
      'Set clip duration (4–8 seconds works best for social content) and aspect ratio to match your target platform.',
      'Generate and review. If the motion is too fast, too slow, or goes in the wrong direction, refine the motion prompt and regenerate. Small wording changes make a significant difference.',
      'Use the timeline editor to extend the clip or trim it if needed. Export at the required spec for the placement.',
      'When using for client deliverables or external social content, disclose that the video was AI-generated, and confirm client approval in line with Miroma\'s AI policy (§6.4).',
    ],
    video: null,
  },

  {
    title: 'Write a video script and produce it end-to-end in LTX Studio',
    category: 'Creative & Production',
    tool: 'LTX Studio',
    description: 'LTX Studio handles the full journey from written brief to finished video — without leaving the platform. Write the script, auto-generate a storyboard, produce scene visuals, assemble the timeline, and export a finished cut. Particularly effective for social content, campaign concepts, and internal productions where speed matters.',
    tutorialUrl: 'https://ltx.studio/blog/how-to-write-a-video-script-with-ai',
    type: 'workflow',
    steps: [
      'Define the brief before writing anything: target audience, desired action, platform, video length, and tone. Note what to exclude (competitor references, off-brand language, etc.).',
      'Draft the script using LTX Studio\'s built-in script generator or Claude. Target ~150 words per 60 seconds. Read it aloud — cut filler and sharpen the hook.',
      'Edit the script for brand voice and message clarity, then paste it into LTX Studio\'s Script-to-Video tool.',
      'The platform maps each line to a scene and generates a storyboard automatically. Review the scene breakdown and adjust any scene descriptions before generating visuals.',
      'Apply your Brand Kit and generate scene visuals. Iterate on any scenes that need adjustment — use LTX-2.3 for quality output, LTX-2.3 Fast for rapid iteration rounds.',
      'Arrange the sequence in the timeline editor. Extend clips as needed, add voiceover or dialogue using the Audio-to-Video feature, and add any music or SFX.',
      'Export in the required format: 1080p for client presentations; platform ratios for social (9:16 for Reels/TikTok, 16:9 for YouTube).',
      'Before sharing externally, confirm client agreement to use AI-generated video per Miroma\'s AI policy (§6.4) and disclose AI origin in any external or public-facing outputs.',
    ],
    video: null,
  },

  {
    title: 'Identify high-potential moments from raw footage',
    category: 'Creative & Production',
    tool: 'Descript',
    description: 'Finding the best moments in hours of raw footage used to mean watching everything. Descript\'s Underlord AI scans footage and surfaces the most engaging moments — grouped by sentiment, character, or theme — replacing hours of manual scrubbing with an intelligent first pass.\n\nUse it at the top of the edit process to quickly identify what you\'re working with.',
    type: 'workflow',
    steps: [
      'Upload your raw footage to Descript and wait for transcription to complete.',
      'Open Underlord and select "Find Clips" or "Highlight Reel" from the AI actions.',
      'Set your clip criteria: length (e.g. 30–90 seconds), theme or keyword, sentiment (positive moments, emotional peaks, high-energy sections).',
      'Review Underlord\'s suggestions in the clip tray. Each clip includes a reason for selection.',
      'Approve, reject, or adjust each clip. Mark the strongest for export.',
      'Use the approved clips as the starting point for your edit, or export them directly as a highlights package.',
    ],
    video: null,
  },

  {
    title: 'Export a clean rough cut directly to Premiere',
    category: 'Creative & Production',
    tool: 'Descript',
    description: 'Editors waste time cleaning up audio before they can even start the creative work. Descript removes filler words, silences, and retakes in one click, then exports a structured rough cut as an Adobe Premiere XML — letting editors skip the cleaning phase entirely and focus their time on the finish.',
    type: 'workflow',
    steps: [
      'Upload your recorded footage to Descript and wait for transcription.',
      'Use Remove Filler Words (Underlord menu) to automatically remove "um", "uh", "like", and repeated words across the entire session.',
      'Use Remove Silence to cut dead air — set a silence threshold (usually 0.5–1 second) and apply.',
      'Mark any retakes or off-camera moments for deletion by selecting and deleting in the transcript.',
      'Review the cleaned sequence in the composition view and make any final adjustments.',
      'Export as Adobe Premiere Pro (XML) from the File menu. Open in Premiere — all edits transfer as cuts on the timeline.',
    ],
    video: null,
  },

  // ── PRODUCTIVITY ──────────────────────────────────────

  {
    title: 'Turn every meeting into action items',
    category: 'Account Management',
    tool: 'Fireflies',
    description: 'Fireflies joins your calls automatically and does the work after — transcribing the conversation, generating a structured summary, and extracting a clean action item list. Share with your team before you\'ve closed the laptop.\n\nParticularly valuable for client calls where follow-up accountability matters.',
    type: 'workflow',
    steps: [
      'Connect Fireflies to your Google Calendar or Microsoft Calendar — it will auto-join all future meetings.',
      'After each meeting, Fireflies generates a full transcript, AI summary, and action item list automatically.',
      'Review the action items in the Fireflies dashboard — they\'re extracted from the meeting based on commitments and next steps discussed.',
      'Edit any action items that need clarification, then assign owners and due dates.',
      'Share the meeting summary and action list with attendees directly from Fireflies, or copy into your project management tool.',
      'Use AskFred to ask follow-up questions about the meeting content — e.g. "What did the client say about budget?"',
    ],
    video: null,
  },

  {
    title: 'Prep for any client meeting in 5 minutes',
    category: 'Account Management',
    tool: 'Fireflies',
    description: 'Your Fireflies transcript library is a searchable record of everything discussed with every client across every meeting. Brief yourself fully before any call — what was decided, what was promised, where the relationship stands — without reading a single set of notes.\n\nParticularly useful for prepping a colleague who is attending a client meeting for the first time.',
    type: 'workflow',
    steps: [
      'Open Fireflies and navigate to the search bar. Search by client name, project name, or topic keyword.',
      'Filter by date range to focus on recent meetings or a specific project period.',
      'Use AskFred to ask natural language questions: "What did we agree to deliver by end of month?" or "What was the client\'s main concern last time?"',
      'Review the AskFred summary and click through to the relevant transcript sections for full context.',
      'Note any open commitments or unresolved questions to address in the upcoming meeting.',
      'Brief any colleagues attending the meeting using the Fireflies shared summary.',
    ],
    video: null,
  },

  {
    title: 'Create professional presentations from raw notes',
    category: 'Account Management',
    tool: 'Claude',
    description: 'Raw notes don\'t have a narrative — that\'s the hard part of presentation writing. Give Claude the notes and the context and get back a fully structured presentation with clear narrative flow, slide-by-slide structure, and formatting guidance. Gets you from blank slide to first draft without the layout work.\n\nWorks well for internal reviews, client status updates, and end-of-campaign decks.',
    type: 'prompt',
    variables: [
      { id: 'presentation_goal', label: 'Presentation goal' },
      { id: 'audience', label: 'Audience' },
    ],
    prompt: `Please turn the following raw notes into a structured presentation outline.

Deliver:
1. A recommended narrative arc (opening → middle → closing) in 2–3 sentences
2. Slide-by-slide structure: slide title + 3–5 concise bullet points per slide
3. Speaker notes for each slide (2–3 sentences — what to say, not just what's on the slide)
4. Suggestions for which slides would benefit from data visualisation (chart or graph recommendations)
5. A strong opening statement (the first thing the presenter says) and a closing call to action

Presentation details:
Goal: {{presentation_goal}}
Audience: {{audience}}
Length: [NUMBER OF SLIDES OR PRESENTATION DURATION]
Tone: [e.g. confident and data-led / conversational / formal client-facing]

Raw notes:
[PASTE NOTES HERE]`,
    video: null,
  },

  {
    title: 'Distil a lengthy creative brief into the essentials',
    category: 'Account Management',
    tool: 'Claude',
    description: 'A 20-page client brief is not a creative brief. Claude distils it down to what the team actually needs to start work — the core ask, the audience, the message, the tone, and the must-haves — on one page. Cuts onboarding time and keeps everyone pointing in the same direction.\n\nSend this version to the creative team alongside the full document, not instead of it.',
    type: 'prompt',
    prompt: `Please read the full brief below and distil it into a one-page creative team summary. Include only what the team needs to start work — cut anything that is background, context, or process.

Structure the summary as:
1. The Core Ask (1 sentence — what are we making and why?)
2. Target Audience (2–3 sentences — who are they, what do they think now, what do we want them to think?)
3. Key Message (1 sentence — the single thing the work must communicate)
4. Tone of Voice (3–5 descriptive words + 1 sentence of context)
5. Mandatory Inclusions (list — anything that must appear in the work)
6. Hard Constraints / No-Gos (list — things to avoid or exclusions)
7. Deliverables (format, quantity, dimensions)
8. Deadline (key dates only)

Flag anything that is unclear or contradictory in the original brief with [NEEDS CLARIFICATION].

Full brief:
[PASTE BRIEF HERE]`,
    video: null,
  },

  {
    title: 'Format and restructure slides from a Word document',
    category: 'Account Management',
    tool: 'Claude',
    description: 'Word documents don\'t translate into slides — someone has to do that work. Claude takes the document content and returns a clear slide structure with hierarchy, visual layout guidance, and suggestions for where charts or callout boxes would land the message harder.\n\nEliminates the manual work of translating written documents into presentation format.',
    type: 'prompt',
    variables: [
      { id: 'presentation_type', label: 'Presentation type (e.g. client pitch)' },
      { id: 'audience', label: 'Audience' },
    ],
    prompt: `Please convert the following document content into a slide deck structure.

For each slide, provide:
1. Slide number and title
2. 3–5 bullet points of slide content (concise, scannable — max 10 words per bullet)
3. One-line speaker note (what to say that isn't on the slide)
4. Visual suggestion (e.g. "bar chart showing X", "two-column layout", "full-bleed image", "pull quote")

Additional instructions:
- Group related content logically — prioritise narrative flow over the original document order if needed
- Suggest a "hero stat" or standout callout for the opening slide
- Identify any sections that are too dense for slides and recommend cutting or moving to an appendix

Presentation type: {{presentation_type}}
Audience: {{audience}}
Target slide count: [NUMBER OR RANGE]

Document content:
[PASTE DOCUMENT TEXT HERE]`,
    video: null,
  },

  {
    title: 'Log and organise press coverage automatically',
    category: 'PR & Communications',
    tool: 'Claude',
    description: 'Keeping a live press coverage log organised is time-consuming when done manually. Paste your coverage and Claude extracts the key data from each piece — publication, date, sentiment, coverage type, reach — and formats it into a clean table ready for client reporting.\n\nKeeps tracking organised and client-ready throughout a campaign or award cycle without manual data entry.',
    type: 'prompt',
    prompt: `Please organise the following press coverage into a structured press log.

For each piece of coverage, extract and record in a table:
| Publication | Date | Journalist | Headline | Coverage Type | Sentiment | Key Quote/Point | Est. Reach |

Coverage types to use: Feature / Interview / Review / News Mention / Opinion / Roundup

After the table, add:
- A brief overall summary (3–4 sentences on the quality and tone of coverage)
- The 3 strongest pieces and why
- Any concerning coverage or tone issues to flag

Press coverage to process:
[PASTE ARTICLE TEXT, LINKS WITH DESCRIPTIONS, OR COVERAGE NOTES HERE]`,
    video: null,
  },

  {
    title: 'Pull the best quotes from press coverage instantly',
    category: 'PR & Communications',
    tool: 'Claude',
    description: 'Award entries, client highlight reels, and end-of-campaign reports all need the best quotes from press coverage — and finding them manually takes time. Claude scans everything and surfaces the strongest quotes and soundbites, flagged by purpose.\n\nParticularly useful during award season when you\'re pulling together evidence across a long campaign period.',
    type: 'prompt',
    prompt: `Please scan the following press coverage and transcripts and surface the strongest quotes.

Deliver:
1. Top 5 quotes about our brand/client (most positive, most impactful, most shareable — label each)
2. 3 quotes suitable for award entry submissions (authoritative, outcome-focused)
3. Best "hero quote" — the single strongest thing said about us (explain your choice in one sentence)
4. Any negative or ambiguous coverage to be aware of (quote + publication)

For each quote, include:
- The quote in full
- Publication / source
- Date
- Why it's strong or notable

Coverage and transcripts:
[PASTE PRESS ARTICLES, REVIEW TEXT, OR TRANSCRIPT EXCERPTS HERE]`,
    video: null,
  },

  {
    title: 'Extract ad specs from PDFs into a clean CSV',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    description: 'Ad spec PDFs from publishers are dense and inconsistently formatted. Paste the content into Claude and get a structured table with all key specifications extracted — dimensions, file types, size limits, copy limits, deadlines — ready to drop into a spreadsheet.\n\nEliminates manual data entry and reduces spec errors across a campaign\'s full asset suite.',
    type: 'prompt',
    prompt: `Please extract all ad specifications from the following document and organise them into a clean table.

For each ad format, capture these fields (use "N/A" if not specified):
| Format Name | Dimensions (px) | File Type(s) | Max File Size | Animation | Max Animation Length | Headline Chars | Body Chars | Safe Area | Submission Deadline |

After the table:
- Flag any specifications that seem unusual or that commonly cause production issues
- Note any formats where information appears to be missing from the source document

Source document content:
[PASTE SPEC SHEET TEXT OR PDF CONTENT HERE]`,
    video: null,
  },

  {
    title: 'Speed up HTML ad builds and fix code errors fast',
    category: 'Creative & Production',
    tool: 'Claude',
    description: 'HTML ad debugging is time-consuming and detail-heavy — especially when you\'re building for multiple ad servers simultaneously. Paste your code and Claude reviews it for errors, optimisation opportunities, and ad server compatibility issues, then returns a corrected version.\n\nUseful for rich media builds, animated ads, and any HTML5 display formats going into DV360, Sizmek, or similar ad servers.',
    type: 'prompt',
    variables: [
      { id: 'ad_dimensions', label: 'Ad dimensions (e.g. 300×250)' },
      { id: 'ad_server', label: 'Ad server (e.g. Google DV360)' },
    ],
    prompt: `Please review the following HTML ad code and return a full assessment and corrected version.

Review for:
1. Syntax errors or broken code
2. Click tag implementation (correct for the specified ad server)
3. File size and load performance optimisations
4. Browser compatibility issues (Chrome, Safari, Firefox, Edge)
5. Ad server compatibility issues for the specified platform
6. Any animations that may not run correctly or violate platform policies

Then provide:
- A corrected version of the full code
- A brief change log explaining each edit made

Ad details:
Dimensions: {{ad_dimensions}}
Ad server / platform: {{ad_server}}
Any known issues: [DESCRIBE IF YOU ALREADY KNOW SOMETHING IS WRONG]

HTML code:
[PASTE CODE HERE]`,
    video: null,
  },

  // ── ANALYTICS ─────────────────────────────────────────

  {
    title: 'Transform campaign data into client stories',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    description: 'Numbers don\'t convince clients — stories do. Feed Claude your campaign performance data and it writes the narrative: what worked and why, what underperformed and the honest explanation, and what comes next. Turns a reporting meeting from a data dump into a strategic conversation.\n\nWorks best when you give it the context around the numbers, not just the numbers themselves.\n\nData handling: Do not include personally identifiable information or confidential data that has not been approved for AI processing. Aggregate performance metrics are fine; individual-level or personally identifying data is not.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'campaign_objective', label: 'Campaign objective' },
    ],
    prompt: `Please write a campaign performance narrative for {{client_name}}'s client report based on the data below.

The narrative should:
1. Open with the headline result (the most important number, framed confidently)
2. Explain what worked and why it worked (not just what happened, but the reason)
3. Address any underperformance directly and honestly — include context, not excuses
4. Connect performance back to the original campaign objective
5. Close with 2–3 clear recommendations for what to do next

Tone: professional but conversational — confident, not defensive. Write for a marketing director who understands data but wants to understand the story behind it.

Length: 4–5 paragraphs.

Campaign objective: {{campaign_objective}}

Campaign data:
[PASTE METRICS, RESULTS, AND ANY CONTEXT HERE]`,
    video: null,
  },

  {
    title: 'Write a media plan narrative',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    description: 'A media plan is numbers on a spreadsheet. A media plan narrative is what wins the room. Claude writes the strategic rationale — explaining channel selection, budget allocation, and targeting in plain language — turning a technical document into a persuasive client presentation.\n\nWrite this before your media planning presentation and use it as the voiceover script.\n\nData handling: Do not include personally identifiable information or confidential data that has not been approved for AI processing. Channel-level budget and targeting data is fine; individual-level audience data or personally identifying information is not.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'campaign_objective', label: 'Campaign objective' },
    ],
    prompt: `Please write a strategic narrative for {{client_name}}'s media plan below, formatted as a presentation voiceover script.

The narrative should explain, in order:
1. The strategic rationale (why this approach is right for this client and objective)
2. Channel strategy (why each channel is included and what role it plays — reach, conversion, retention, etc.)
3. Budget allocation (how budget is split, why, and what that investment buys us)
4. Audience and targeting strategy (who we're reaching, when, and how we're finding them)
5. What success looks like (KPIs, benchmarks, and what we'll optimise toward)

Tone: confident, clear, and jargon-free. Write it as someone would say it, not as a document someone would read. Present tense.

Campaign objective: {{campaign_objective}}

Media plan data:
[PASTE CHANNEL MIX, BUDGET BREAKDOWN, TARGETING APPROACH, AND KPIs HERE]`,
    video: null,
  },

  {
    title: 'Parse a complex media plan into a clean data structure',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    description: 'Media plans often arrive as complex Excel files with mixed gross/net costs, inconsistent column names, and logic buried in formulas. Paste the raw rows into Claude and get a normalised, clean table with consistent fields, flagged discrepancies, and a budget summary — ready to feed into a reporting tool or share with a client.\n\nParticularly useful when onboarding a new client plan or standardising formats across agencies.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'campaign_name', label: 'Campaign name' },
      { id: 'currency', label: 'Currency (e.g. GBP)' },
    ],
    prompt: `You are a data analyst. Parse the media plan below for {{client_name}}'s {{campaign_name}} campaign and output a clean, structured table.

Paste the media plan rows here:
---
[PASTE MEDIA PLAN ROWS]
---

Extract and normalise the following columns for every line item:
- Campaign
- Platform / Channel
- Format / Ad unit
- Start date
- End date
- Gross cost (as stated)
- Net/client cost (if different — note any agency commission or rebate applied)
- Impressions / Reach target (if stated)
- Currency: {{currency}}
- Notes (flag anything unusual or unclear)

Output the result as a clean markdown table with one row per line item.

Then provide a summary section:
- Total gross budget
- Total net/client budget
- Budget split by channel (%)
- Date range of the full campaign
- Any line items with missing or inconsistent data flagged for review

Flag any cells where gross ≠ net but no commission rate is stated.`,
    video: null,
  },

  {
    title: 'Build a social sentiment dashboard in minutes',
    category: 'Social Media',
    tool: 'Claude',
    description: 'After a campaign launch or brand moment, understanding what the audience actually thinks can take hours of manual reading. Paste your comment set into Claude and get a structured sentiment breakdown in minutes — how positive, negative, or mixed the reaction is, the themes driving each, and which individual comments are worth flagging to the team. Sarcasm and irony are called out explicitly, and anything ambiguous is held for human review rather than classified on a guess.\n\nParticularly useful after a campaign launch or brand moment when you need to understand audience reaction quickly.\n\nData handling: Before pasting, remove all commenter names, handles, and timestamps from your export. Work from post content only and map responses back manually. Do not upload comment data with personal identifiers attached — this is required under Rule 5 of the Claude Usage Rules.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'channel', label: 'Channel (e.g. Instagram)' },
    ],
    prompt: `You are classifying sentiment and extracting themes from social comments for {{client_name}}, {{channel}}.

Comments to classify (commenter handles already removed — use a sequential ID per comment):
[PASTE COMMENT SET WITH IDs, e.g. C001, C002...]

Brand-specific sentiment guidance:
[e.g. "this is illegal" is praise in this fan community — list any brand-specific rules]

Prior period summary (for comparison):
[PASTE OR WRITE "NONE"]

Platform context:
{{channel}}

Method:

Step 1. For each comment, read it twice. First pass: literal meaning. Second pass: tone, irony, sarcasm.
Step 2. Apply the brand-specific guidance. Use the rules supplied for fan-community language.
Step 3. Classify: POSITIVE, NEUTRAL, NEGATIVE, MIXED, or OFF-TOPIC. Assign confidence: HIGH, MEDIUM, LOW. LOW confidence forces human review.
Step 4. Tag a theme for each comment, max 4 words. Use consistent labels across the set.
Step 5. After classifying every comment, count distributions and aggregate themes.
Step 6. Compare against prior period if supplied. Highlight three changes.
Step 7. Pick three notable individual comments: one positive, one negative, one surprising. Anonymise the quote.
Step 8. Self-check: no PII in any output. Non-English comments tagged not guessed.

Per-comment output:
| ID | Sentiment | Confidence | Theme | Notes |

Summary output:
1. Sentiment distribution (counts and %)
2. Top 5 themes by volume, with sentiment skew of each
3. Three notable comments (positive, negative, surprising)
4. Three changes from prior period (if comparator supplied)

Constraints:
- Mark sarcasm and irony explicitly in Notes
- Mark non-English comments and skip rather than guess: [LANG: <code>]
- No personally identifying detail in outputs`,
    video: null,
  },

  {
    title: 'Run a creative ideation session with your team',
    category: 'Creative & Production',
    tool: 'Springboards',
    description: 'Springboards is built for collaborative creative work. Share a session with your team, generate sparks together, and use the Canvas to organise the strongest directions in real time — replacing the whiteboard brainstorm with something faster, more structured, and more diverse in output.\n\nParticularly useful when you need a wide range of directions quickly and want the team to converge on the strongest.',
    type: 'workflow',
    steps: [
      'Create a new session, set up a Brand Profile for the client, and share the session with your team.',
      'Input the brief and generate an initial set of sparks for everyone to react to together.',
      'Each team member pins their strongest directions to the shared Canvas.',
      'Group pinned directions by theme — look for patterns and clusters of strong ideas.',
      'Use Chat to refine the strongest directions conversationally — push further, explore variations, or narrow down.',
      'Use Canvas Templates to structure the output into a format ready to brief the creative team.',
    ],
    video: null,
  },

  {
    title: 'Generate an AEO and GEO readiness report',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Generative AI is changing how people discover brands — and most clients don\'t know whether they\'re appearing in AI answers or being left out entirely. Give Claude answer samples from ChatGPT, Perplexity, or Google AI Overviews and it turns them into a structured readiness report: where the client is visible, where they\'re partially represented, and where they\'re missing — with content recommendations ranked by the effort required to close the gap.\n\nAn increasingly valuable deliverable for clients with significant organic search investment.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'capture_date', label: 'Sample capture date' },
    ],
    prompt: `You are an AEO/GEO specialist reviewing how {{client_name}} appears in generative AI engine answers.

Client positioning:
[PASTE CLIENT POSITIONING PARAGRAPH]

Priority keyword themes (broad, not exact-match):
[LIST 5–10 KEYWORD THEMES]

Competitor set:
[LIST 3–6 COMPETITORS]

Sample generative-engine outputs (capture date: {{capture_date}}):
[PASTE OR DESCRIBE OUTPUTS FROM ChatGPT, PERPLEXITY, GOOGLE AI OVERVIEWS, GEMINI]

Method:

Step 1. For each theme, classify the client's visibility: VISIBLE (named with context), PARTIAL (named in passing), ABSENT.
Step 2. For each ABSENT or PARTIAL theme, identify which competitors win. Note the citation source the engine pulled from (the publication, dataset, or page that earned the mention).
Step 3. Diagnose the win: is it content authority, schema, citations from third parties, sheer volume, or recency?
Step 4. Generate content recommendations. Each must specify the format (comparison page, primary research, FAQ schema, founder blog), the topic, and the source it should cite or earn citations from.
Step 5. Score each recommendation: effort (S/M/L), likely impact (S/M/L), and a one-line evidence tie.
Step 6. Identify two structural fixes (schema, citations, distribution) actionable this quarter.

Output:
1. Visibility table (theme, status, dominant competitor, why)
2. Five content recommendations, ranked by impact/effort
3. Two structural fixes
4. Confidence note: any inferences flagged [INFERRED]

Constraints:
- Be specific. "Improve content" is not a recommendation.
- Flag any claim about competitor strategy as inferred unless source material proves it.`,
    video: null,
  },

  {
    title: 'Build a pitch deck structure and narrative from a brief',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Paste a client brief and get a complete pitch deck structure back in minutes — slide-by-slide narrative, executive summary, strategic positioning, and appendix recommendations. Cuts first-draft deck time from hours to under 15 minutes, so the team is editing and refining rather than staring at a blank page.\n\nFill in the variables, paste in the brief, and use the output as the skeleton for your deck build.\n\nData handling: Do not paste confidential client briefs or proprietary information without confirming your client contract permits AI processing of that material. Summarise or paraphrase sensitive sections, or check with Legal if unsure.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
      { id: 'client_name', label: 'Client name' },
      { id: 'pitch_date', label: 'Pitch date' },
      { id: 'budget', label: 'Budget (if known)' },
    ],
    prompt: `You are a senior strategy director at {{agency_name}}, preparing a pitch deck for {{client_name}}. The pitch is on {{pitch_date}}. Budget: {{budget}}.

Below is the client brief:
---
[PASTE BRIEF HERE]
---

Create a complete pitch deck structure with the following sections. For each section, write the full slide narrative and key bullet points. Flag any gaps in the brief that need answering before this goes to deck.

Format each slide as:
**[SLIDE TITLE]**
Narrative: [2–3 sentence speaker note]
Key points:
- [point]
- [point]

---

1. EXECUTIVE SUMMARY (1 slide)
   - One-sentence pitch
   - Three core ideas that will win this

2. THE OPPORTUNITY (1–2 slides)
   - Client's current problem or market moment
   - Why now

3. OUR APPROACH (2–3 slides)
   - Strategic platform
   - Key idea with supporting rationale
   - How it ladders to the client's business objective

4. THE WORK (2–4 slides)
   - Campaign idea or concept title
   - Campaign narrative: what we'd make, where it runs, how it works
   - Channel breakdown

5. WHY US (1–2 slides)
   - Relevant case study: title, challenge, solution, result
   - Team overview

6. BUDGET & TIMELINE (1 slide)
   - Phased budget breakdown across {{budget}}
   - Key milestones and delivery dates relative to {{pitch_date}}

7. NEXT STEPS (1 slide)
   - Clear ask
   - Decision timeline

After completing all slides, list any brief gaps or unanswered questions that need resolving before the deck is finalised.`,
    video: null,
  },


  // ── HR & PEOPLE ───────────────────────────────────────

  {
    title: 'Write a job description from a role brief',
    category: 'HR & People',
    tool: 'Claude',
    description: 'A well-written job description attracts the right candidates and sets clear expectations from day one. Give Claude the role context and key responsibilities and get back a complete, polished JD — structured correctly, written compellingly, and consistent across every hire.\n\nSaves the time of starting from scratch and avoids the generic, jargon-heavy listings that put the right candidates off before they\'ve even applied.',
    type: 'prompt',
    variables: [
      { id: 'job_title', label: 'Job title' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `Please write a complete job description for the {{job_title}} role at {{agency_name}}.

Structure it as:
1. Job title and reporting line
2. About the team / department (2–3 sentences on context)
3. About the role (3–4 sentences — what this person will own and why it matters)
4. Key responsibilities (8–10 bullet points — specific, outcome-oriented)
5. What we're looking for — Must have (5–6 requirements)
6. What we're looking for — Nice to have (3–4 requirements)
7. What we offer (leave as placeholder — to be filled in with company benefits)

Tone: clear, direct, and inclusive. Avoid jargon and vague phrases like "fast-paced environment". Write it for someone who is good at their job and considering whether to apply.

Role details:
Job title: {{job_title}}
Agency: {{agency_name}}
Team / department: [TEAM NAME]
Reporting to: [MANAGER TITLE]
Location / working arrangement: [e.g. London, hybrid 3 days]
Seniority: [e.g. Mid-level / Senior / Head of]
Core responsibilities: [DESCRIBE WHAT THE PERSON WILL DO]
Key skills required: [LIST THE ESSENTIAL SKILLS]`,
    video: null,
  },

  {
    title: 'Generate structured interview questions for any role',
    category: 'HR & People',
    tool: 'Claude',
    description: 'Inconsistent interviews lead to inconsistent hiring. Claude generates a structured question set from the job description and hiring criteria — covering competency, culture, and situational judgement in the right proportions — so every interviewer is working from the same framework.\n\nSaves preparation time and ensures every interviewer is working from the same structure.\n\nImportant: This prompt generates question frameworks only. Claude must not be used to score, rank, or assess individual candidates — that judgement must come from a person. Do not paste CVs, applications, or any information about a specific candidate. Per Rule 13 of the Claude Usage Rules, Claude must not be used to evaluate or make decisions about individuals.',
    type: 'prompt',
    variables: [
      { id: 'job_title', label: 'Job title' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `Please generate a structured interview question set for the {{job_title}} role at {{agency_name}}.

Include:
1. 3 opening / rapport-building questions (non-intimidating, get the candidate talking)
2. 5 competency-based questions in STAR format (tie each clearly to the job requirements)
3. 3 situational / problem-solving questions (present realistic scenarios from this role)
4. 2 culture and values questions (assess alignment without leading)
5. 1 closing question that gives the candidate a chance to ask or add something

For each competency question, add a "What good looks like" note (1–2 sentences on what a strong answer includes).

Role details:
Job title: {{job_title}}
Agency: {{agency_name}}
Level: [SENIORITY]
Key competencies to assess: [LIST 3–4 — e.g. stakeholder management, creative thinking, analytical rigour]
Culture / values to assess: [DESCRIBE WHAT MATTERS TO YOUR TEAM]

Job description:
[PASTE JD OR KEY RESPONSIBILITIES HERE]`,
    video: null,
  },

  {
    title: 'Draft a 30-60-90 day onboarding plan',
    category: 'HR & People',
    tool: 'Claude',
    description: 'The first 90 days define how a new hire settles in, builds relationships, and understands what success looks like. Claude produces a structured plan with clear milestones for each phase — what to learn, who to meet, and what to deliver — so managers spend less time improvising and new starters hit the ground running.\n\nParticularly useful for roles with complex stakeholder environments or significant ramp-up time.',
    type: 'prompt',
    variables: [
      { id: 'job_title', label: 'Job title' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `Please draft a 30-60-90 day onboarding plan for a new {{job_title}} joining {{agency_name}}.

For each phase, include:
- The primary focus and goal for that period
- 4–5 specific learning priorities (systems, processes, relationships, client context)
- 3–4 relationship-building actions (who to meet and why)
- 1–2 early deliverables or contributions (what they should produce or own by end of the phase)
- A suggested manager check-in agenda for the end of that phase

Phase 1 (Days 1–30): Learn — understand the business, team, and role
Phase 2 (Days 31–60): Contribute — start adding value, take on first real work
Phase 3 (Days 61–90): Own — operate with autonomy, begin identifying improvements

Role details:
Job title: {{job_title}}
Agency: {{agency_name}}
Team: [DEPARTMENT]
Key priorities in first quarter: [WHAT THIS PERSON NEEDS TO ACHIEVE]
Key stakeholders: [WHO THEY NEED TO BUILD RELATIONSHIPS WITH]
Tools and systems to learn: [LIST KEY PLATFORMS OR PROCESSES]`,
    video: null,
  },

  {
    title: 'Summarise HR policies into plain English',
    category: 'HR & People',
    tool: 'Claude',
    description: 'HR policies are written for legal protection, not for human comprehension. Claude translates policy documents into clear, jargon-free summaries that employees can actually read and understand — covering what they need to know without the legalese.\n\nIdeal for onboarding packs, policy update communications, and making compliance documentation accessible to the whole team.',
    type: 'prompt',
    prompt: `Please summarise the following HR policy into a plain English version that any employee can understand.

Format the summary as:
1. What this policy covers (1 sentence)
2. Who it applies to (1 sentence)
3. The key things employees need to know (5–7 bullet points — the practical essentials only)
4. What employees should do if they have a question or concern (clear action steps)
5. Where to find the full policy (leave as placeholder)

Guidelines:
- Write at a clear, accessible reading level — no jargon or legal terms without a plain-language explanation
- Keep the full summary to one page or less
- Do not alter the meaning of any provision — if something is ambiguous, flag it with [NEEDS CLARIFICATION FROM HR]

Policy document:
[PASTE POLICY TEXT HERE]`,
    video: null,
  },

  // ── LEGAL & FINANCE (additional) ──────────────────────

  {
    title: 'Review a contract and flag key risks',
    category: 'Legal',
    tool: 'Claude',
    description: 'Claude prepares a structured summary of flagged clauses to give your legal team a faster starting point — it does not replace legal review. Open the document in Word and use the Claude extension to identify unusual clauses, missing standard protections, and key commercial terms.\n\nEvery output must go to Legal before any decision is made or document is signed. This is preparation material for legal review, not a substitute for it. Per Rule 12 of the Claude Usage Rules, Legal must do the substantive review.',
    type: 'workflow',
    steps: [
      'Open the contract in Microsoft Word. Access the Claude panel via Add-ins in the top ribbon.',
      'Ask Claude to review the document: "Review this contract and flag any unusual or high-risk clauses, missing standard protections, and key commercial terms I should be aware of."',
      'Claude reads the full document and returns a structured risk summary — section by section.',
      'Review the flagged items and add Word comments where you need legal input or clarification.',
      'Ask follow-up questions directly in the panel: "What does clause 8.2 mean in plain English?" or "Is this liability cap standard for this type of agreement?"',
      'Send the annotated document to your legal team with a summary of the flagged items — they review exceptions, not the whole document.',
    ],
    video: null,
  },

  {
    title: 'Draft a contract or NDA from agreed terms',
    category: 'Legal',
    tool: 'Claude',
    description: 'Drafting contracts from scratch is slow and expensive when it has to go to legal at the very start. Use the Claude extension in Word to generate a structured first draft from the agreed commercial terms — then route to legal for review rather than drafting.\n\nSpeeds up the contracting process and reduces the cost of getting to a reviewable document.',
    type: 'workflow',
    steps: [
      'Open a blank document in Microsoft Word and access the Claude panel via Add-ins.',
      'Tell Claude what you need: "Draft a [contract type / NDA] based on the following agreed terms." Paste in the key terms — parties, scope, fees, territory, duration, and any specific restrictions.',
      'Claude generates a structured first draft in the panel, with all standard clauses for that agreement type included.',
      'Copy the output into your Word document and review section by section.',
      'Ask Claude to refine specific clauses: "Make the payment terms net 30 days" or "Add a clause requiring written approval for sub-licensing."',
      'Flag any clauses needing specific legal review and send to your legal team for sign-off.',
    ],
    video: null,
  },

  {
    title: 'Review platform terms of service and flag compliance risks',
    category: 'Legal',
    tool: 'Claude',
    description: 'Every AI tool your agency uses has terms of service that govern how you can use it with client work — and those terms change without much notice. CapCut\'s policy shift on uploaded footage is a recent example that caught agencies out. Paste the TOS into Claude and get a structured first-read: what the terms say, where the risks are, and what to ask Legal.\n\nThis is a structured preliminary flag, not a compliance determination. Legal or your IT/compliance team must make the final call before any tool is approved for client work. Per Rule 12 of the Claude Usage Rules, Claude cannot perform the compliance review itself.',
    type: 'prompt',
    variables: [
      { id: 'tool_name', label: 'Tool / platform name' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `You are a legal and compliance reviewer for {{agency_name}}.

Review the following terms of service or privacy policy for {{tool_name}} and flag any clauses that could conflict with our use of this tool for client work.

Paste the terms here:
---
[PASTE TERMS OF SERVICE TEXT]
---

Assess and flag the following areas:

1. DATA OWNERSHIP
   - Does the platform claim any rights to content we upload, create, or generate?
   - Are there AI training data clauses (i.e. is our content used to train their models)?

2. CLIENT DATA PROTECTION
   - What data is shared with third parties?
   - Is PII (personally identifiable information) protected?
   - Is client or campaign data kept confidential?

3. IP RIGHTS
   - Who owns the output generated using the tool?
   - Are there restrictions on commercial use of outputs?

4. MATERIAL CHANGE CLAUSES
   - How much notice do they give before changing terms?
   - Can they change terms retroactively?

5. LIABILITY & INDEMNIFICATION
   - Are there clauses that shift liability to the user?
   - Any indemnification requirements worth noting?

For each area, provide:
- FINDING: What the terms actually say
- RISK LEVEL: Low / Medium / High
- RECOMMENDED ACTION: What {{agency_name}} should do (e.g. add a clause to client contracts, restrict use case, escalate to legal)

End with PRELIMINARY FLAGS SUMMARY and a SUGGESTED NEXT STEP: No major flags identified — verify with Legal before use / Restrictions noted — review with Legal before use / Escalate to Legal before continuing use.

Note: This output is a structured first-read only. It is not a compliance determination. Legal or your IT/compliance team must make the final decision before this tool is approved for client work.`,
    video: null,
  },

  {
    title: 'Match receipts to expense claims automatically',
    category: 'Finance',
    tool: 'Claude',
    description: 'Invoice reconciliation looks straightforward until you\'re matching 60 line items across two documents with different vendor name spellings and slightly different amounts. Claude does the matching, flags anything outside the tolerance band you set, and produces a clear action list — what to approve, what to query, what to escalate — in minutes rather than hours.\n\nAlways verify outputs against your source data before acting on them — treat this as a first pass, not a final approval.\n\nData handling: Before pasting, remove any individual names, personal email addresses, or other personal identifiers from invoice or plan rows. Vendor names and company names are fine to include.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'tolerance', label: 'Tolerance (e.g. ±2%)' },
    ],
    prompt: `You are reconciling an invoice against the booked media plan for {{client_name}}.

Media plan (line items, with vendor, placement, gross cost, client cost, dates):
[PASTE MEDIA PLAN ROWS]

Invoice received (line items, vendor, description, amount, date):
[PASTE INVOICE ROWS]

Tolerance: {{tolerance}}
Known approved exceptions: [LIST ANY PRE-APPROVED RATE CHANGES OR MAKE-GOODS, OR "NONE"]

Method:

Step 1. Normalise both datasets. Same vendor name spellings, same date formats, same currency.
Step 2. For each invoice line, find the best matching plan line by vendor, placement, and date.
Step 3. Compare amounts. Apply the tolerance band. Classify each line: EXACT, WITHIN_TOLERANCE, OVER_TOLERANCE, MISSING_FROM_INVOICE, NOT_ON_PLAN.
Step 4. For OVER_TOLERANCE: check if it matches a known approved exception. If yes, note this. If no, flag for query.
Step 5. For NOT_ON_PLAN lines: examine the description. Is it a likely typo, a vendor consolidation, or a genuine new charge?
Step 6. For vendor name mismatches even where amounts agree: flag separately. These are common audit issues.
Step 7. Recommend next steps line by line: approve, query vendor, escalate.

Output:
1. Reconciliation table: | Plan line | Invoice line | Match status | Variance | Notes |
2. Exceptions list: every line not in EXACT status, with a one-line explanation
3. Vendor-name mismatch list (separate)
4. Recommended actions, grouped by approve / query / escalate
5. Any [DATA ISSUE: <description>] flags if data is malformed

Constraints:
- Do not approve anything; recommend only
- Do not pad totals to make them match
- If data is malformed, stop and output [DATA ISSUE: ...] rather than guess`,
    video: null,
  },

  {
    title: 'Automate month-end summaries and variance analysis',
    category: 'Finance',
    tool: 'Claude',
    description: 'Month-end reporting involves the same manual steps every time: formatting data, calculating variances, writing commentary. Open your figures in Excel, use the Claude extension to run the variance analysis and write the narrative, and cut the time spent on monthly close significantly.\n\nParticularly useful when reporting across multiple cost centres or client accounts in a short window.\n\nClaude handles the formatting and narrative — always verify the underlying figures yourself before the report goes to sign-off or distribution.\n\nData handling: If your figures include employee names, salary data, or individual expense lines, anonymise these before pasting. Aggregate and anonymised figures are fine; personal identifiers are not.',
    type: 'workflow',
    steps: [
      'Prepare your monthly figures in Excel with actuals and budget (or prior month) in clearly labelled columns.',
      'Open the Claude panel via Add-ins and ask: "Analyse this data and produce a variance analysis. For each line, calculate the variance in £ and %, flag anything over [your threshold]% variance, and note whether it is favourable or adverse."',
      'Review the variance analysis and confirm flagged items are correct.',
      'Ask Claude to write the narrative: "Write a 3–4 paragraph finance commentary summarising overall performance, explaining the key variances, and noting anything that requires attention next month."',
      'Copy the commentary into your reporting template. Add any context or judgement Claude wouldn\'t have — approvals pending, one-off items, external factors.',
      'Export the completed report with commentary and variance table for sign-off or distribution.',
    ],
    video: null,
  },

  // ── PR & COMMUNICATIONS (additional) ─────────────────

  {
    title: 'Write award entries from campaign results',
    category: 'PR & Communications',
    tool: 'Claude',
    description: 'Award entries are won on structure and storytelling, not just results. Claude takes your campaign objectives, activity, and outcomes and produces a first-draft entry structured for the specific category and judging criteria — so the team is editing, not staring at a blank page.\n\nThe hardest part of award season is starting. This removes that barrier entirely.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
      { id: 'campaign_name', label: 'Campaign name' },
    ],
    prompt: `Please write a first-draft award entry for the {{campaign_name}} campaign by {{agency_name}}.

Structure the entry as:
1. Campaign Overview (100 words — what it was, who it was for, and the challenge it addressed)
2. Strategy & Insight (150 words — what insight drove the approach and why the strategy was right)
3. Creative Idea (150 words — what the idea was and why it stood out)
4. Execution (100 words — what was produced and how it was delivered)
5. Results (150 words — lead with the headline number, then supporting metrics — frame all results relative to benchmark or objective)
6. Why this deserves to win (100 words — make the case directly to the judges)

Guidelines:
- Lead every section with the strongest point
- Be specific with numbers — never be vague about results
- Write in third person unless the entry guidelines specify otherwise
- Agency: {{agency_name}}

Award category / criteria:
[PASTE THE CATEGORY NAME AND JUDGING CRITERIA HERE]

Campaign details:
Campaign: {{campaign_name}}
Client: [CLIENT NAME]
Objective: [WHAT WAS THE CAMPAIGN TRYING TO ACHIEVE?]
Activity: [WHAT DID YOU DO?]
Results: [PASTE YOUR METRICS AND OUTCOMES]`,
    video: null,
  },

  {
    title: 'Draft internal communications for any announcement',
    category: 'PR & Communications',
    tool: 'Claude',
    description: 'Internal communications that are unclear, too long, or badly timed erode trust and create confusion. Claude takes your key message and drafts a well-structured, appropriately toned internal comms piece — whether that\'s an all-staff email, a team update, a leadership announcement, or a change communication.\n\nEspecially useful when the message is sensitive or when you need to communicate something clearly without creating unnecessary noise.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
      { id: 'announcement_topic', label: 'Announcement topic' },
    ],
    prompt: `Please draft an internal communication for {{agency_name}} about the announcement below.

Format:
1. Subject line (for email — clear and specific, not vague)
2. Opening paragraph (lead with the key message in the first 2 sentences — don't bury the news)
3. Body (explain the what, why, and what it means for people — 2–3 short paragraphs)
4. What happens next (clear action or timeline — what should people expect or do?)
5. Closing (who to contact with questions — leave as placeholder for name and email)

Tone guidance:
- Write at the level of the audience (all-staff vs. team-specific vs. senior leadership)
- Be direct — avoid corporate euphemisms
- If the news is difficult, acknowledge it honestly rather than softening it

Announcement details:
What is being communicated: {{announcement_topic}}
Why it's happening: [THE REASON]
Who this affects: [AUDIENCE — e.g. all-staff / specific team / senior leadership]
What people need to do (if anything): [ANY REQUIRED ACTION]
Tone: [e.g. reassuring / matter-of-fact / celebratory]
Sender name / role: [WHO THIS IS COMING FROM]`,
    video: null,
  },

  {
    title: 'Search and compile press coverage for any show or campaign',
    category: 'PR & Communications',
    tool: 'Claude',
    description: 'Manually trawling publications for press coverage is slow and easy to miss. Give Claude a show name, campaign, or brand, and a list of target publications — and get a structured coverage log with headlines, authors, key quotes, and sentiment analysis back in minutes. Works for post-launch reviews, ongoing monitoring, or new business coverage audits.\n\nFill in the variables, add your publication list, and paste the output straight into your coverage tracker or client report.',
    type: 'prompt',
    variables: [
      { id: 'show_or_campaign', label: 'Show / campaign name' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `You are a PR analyst working at {{agency_name}}.

Search for and compile all press coverage of {{show_or_campaign}}.

Use the following publications as your primary source list:
---
[PASTE YOUR PUBLICATION LIST HERE — one per line]
---

For each piece of coverage found, capture the following in a table:
| Publication | Date | Headline | Author | URL | Key quote (max 25 words) | Sentiment |

Sentiment should be: Positive / Mixed / Negative.

After the table, produce:

1. COVERAGE SUMMARY
   - Total pieces found
   - Breakdown by sentiment (Positive / Mixed / Negative)
   - Standout quotes (top 3)
   - Key themes across the coverage

2. GAPS
   - Which publications on the list have not yet covered {{show_or_campaign}}
   - Any notable publications not on the list that have covered it

3. FOLLOW-UP OUTREACH ANGLES
   - Based on gaps and underrepresented angles, suggest 3 targeted pitch ideas for publications that haven't covered it yet

Format the coverage table to be copy-pasteable directly into a Google Sheet.`,
    video: null,
  },

  // ── SOCIAL MEDIA (additional) ─────────────────────────

  {
    title: 'Plan a monthly social content calendar',
    category: 'Social Media',
    tool: 'Claude',
    description: 'A good content calendar is a narrative plan, not just a list of dates. Brief Claude on the client, content pillars, and upcoming moments and get a structured month that balances campaign content, always-on posts, and cultural moments across each platform.\n\nGives the team a plan to react against rather than starting from scratch each week, and makes client approval faster.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'brand_name', label: 'Brand name' },
    ],
    prompt: `Please create a monthly social content calendar for {{client_name}} ({{brand_name}}).

Deliver:
1. A calendar overview — the content themes and narrative arc for the month (3–4 sentences)
2. A week-by-week plan as a table with columns: Week | Date | Platform | Content Pillar | Post Format | Topic / Copy Direction | CTA
3. Notes on key moments to react to (cultural dates, product launches, campaign peaks)
4. 3 evergreen post ideas that can be scheduled at any point during the month

Calendar details:
Client / brand: {{client_name}} / {{brand_name}}
Platforms: [e.g. Instagram, LinkedIn, X, TikTok]
Content pillars: [LIST 3–4 THEMES — e.g. product, culture, education, social proof]
Posting frequency: [e.g. 5× per week across all platforms]
Month: [MONTH AND YEAR]
Key moments this month: [LAUNCHES, EVENTS, CULTURAL DATES, CAMPAIGNS GOING LIVE]
Tone: [BRAND VOICE DESCRIPTION]`,
    video: null,
  },

  {
    title: 'Draft community management responses at scale',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Triage first, draft second. Paste a comment and Claude checks it against escalation triggers before producing reply options — flagging anything that needs Legal or a senior reviewer rather than a public reply. Outputs are drafts for human review; it never auto-publishes.\n\nKeeps response times fast without sacrificing quality, and ensures the right comments never accidentally get a public reply.\n\nData handling: Remove the commenter\'s name, handle, and timestamp before pasting. Do not input any social comment with personal identifiers attached — Rule 5 of the Claude Usage Rules applies.',
    type: 'prompt',
    variables: [
      { id: 'brand_name', label: 'Brand name' },
    ],
    prompt: `You are a community manager for {{brand_name}}.

Brand voice and rules:
[PASTE BRAND VOICE DOCUMENT OR GUIDELINES]

Escalation triggers (anything matching these is flagged, not answered):
- Legal threats or regulatory mentions
- Allegations of harm
- Mentions of competitors by name
- Crisis or sensitive topics: [LIST ANY ACTIVE SENSITIVE TOPICS]
- Personal data shared by user
- Press, journalists, or influencers above a threshold

Comment to respond to (commenter handle redacted):
"[PASTE THE COMMENT HERE]"

Context (post the comment is on, recent activity):
[DESCRIBE THE POST AND ANY RELEVANT RECENT ACTIVITY]

Active brand-side sensitivities (if any):
[LIST ANY CURRENT ISSUES THE BRAND IS NAVIGATING]

Method:

Step 1. Triage the comment against the escalation triggers in order. If any fires, output FLAG and stop drafting.
Step 2. If no trigger fires, judge whether a reply adds value. A defensive reply to a low-signal comment is often worse than silence. If silence is better, output IGNORE with reason.
Step 3. If REPLY is appropriate, draft three options: short (under 15 words), medium (under 30 words), and on-brand-cheeky if the brand voice supports it.
Step 4. For every draft, self-check: no commitment on the brand's behalf, no internal information, no rumour confirmation or denial.
Step 5. If the comment touches an active brand-side sensitivity, downgrade tone by one level (cheeky becomes warm, warm becomes neutral).

Output:
1. Recommendation: REPLY, FLAG, or IGNORE
2. If REPLY: three response options (short, medium, on-brand-cheeky if appropriate)
3. If FLAG: which trigger fired and why
4. If IGNORE: one-line reason

Constraints:
- Never make a commitment on the brand's behalf
- Never quote internal information
- Never confirm or deny rumours, news stories, or speculation
- Outputs are drafts for human review only`,
    video: null,
  },


  // ── TECHNOLOGY & DEVELOPMENT ──────────────────────────

  {
    title: 'Build a landing page or microsite from a brief',
    category: 'Technology & Development',
    tool: 'Claude',
    description: 'Claude can take a brief and produce a fully working landing page — HTML, CSS, and JavaScript — as an interactive Artifact you can preview directly in the chat. No scaffolding, no setup, no waiting for a developer to have availability.\n\nFrom there, iterate in the same conversation: change the layout, adjust copy, add a section, tweak the colour scheme. When it\'s ready, hand off the clean code to deploy.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `Please build a fully working landing page as an HTML Artifact based on the brief below. This is for {{client_name}}, a project at {{agency_name}}.

Requirements:
- Clean, modern design — responsive and mobile-friendly
- Semantic HTML5 structure
- Inline CSS (single file, no external dependencies unless specified)
- Smooth scroll and any simple interactions in vanilla JavaScript
- Placeholder images using a service like placehold.co where needed

Sections to include:
[LIST THE SECTIONS — e.g. hero, features, testimonial, CTA, footer]

Brief:
Client / brand: {{client_name}}
Purpose of the page: [WHAT IS THIS PAGE FOR?]
Primary CTA: [WHAT SHOULD THE USER DO?]
Tone / visual direction: [e.g. clean and minimal / bold and energetic / warm and editorial]
Brand colours (if known): [HEX CODES OR DESCRIPTION]
Key messages: [WHAT MUST THE PAGE COMMUNICATE?]

Build the full page as a single Artifact I can preview and iterate on.`,
    video: null,
  },

  {
    title: 'Debug and fix errors across any codebase',
    category: 'Technology & Development',
    tool: 'Claude',
    description: 'Paste an error message alongside the code that produced it and Claude identifies the root cause, explains what went wrong, and provides a corrected version. It understands the context around the error — not just the line that failed.\n\nUseful for any language or framework. The more context you give it (the full function, the call stack, what you\'ve already tried), the better the fix.',
    type: 'prompt',
    prompt: `Please debug the following code error. I need you to:

1. Identify the root cause (not just the symptom)
2. Explain in plain English what's going wrong and why
3. Provide a corrected version of the relevant code
4. Flag any related issues nearby that could cause problems next

Language / framework: [e.g. JavaScript / React / Python / PHP]
What I was trying to do: [DESCRIBE THE INTENDED BEHAVIOUR]
What I've already tried: [ANY FIXES YOU'VE ATTEMPTED]

Error message:
[PASTE THE FULL ERROR MESSAGE OR CONSOLE OUTPUT]

Relevant code:
[PASTE THE FUNCTION, COMPONENT, OR FILE CAUSING THE ISSUE]`,
    video: null,
  },

  {
    title: 'Review and understand an unfamiliar codebase',
    category: 'Technology & Development',
    tool: 'Claude',
    description: 'Getting up to speed in someone else\'s codebase takes time — reading files, tracing dependencies, guessing at patterns. Upload key files or paste critical sections and Claude explains the architecture, summarises what each component does, flags potential issues, and answers specific questions.\n\nParticularly useful when taking over a project, onboarding to a client\'s existing system, or picking up work after a handoff.',
    type: 'prompt',
    prompt: `Please review the following code and help me understand this codebase quickly.

I need you to:
1. Summarise what this code does at a high level (2–3 sentences)
2. Explain the key components or modules and how they relate to each other
3. Identify any patterns, conventions, or architectural decisions I should know about
4. Flag any areas that look risky, outdated, or likely to cause problems
5. List 3 questions I should try to answer before making changes

Then I'll ask you specific questions about parts I don't understand.

Context:
What this project is: [DESCRIBE THE PROJECT OR SYSTEM]
My role: [e.g. I'm taking it over / I need to add a feature / I'm doing a code review]
Tech stack: [LANGUAGES, FRAMEWORKS, KEY DEPENDENCIES]

Code to review:
[PASTE KEY FILES OR THE MOST IMPORTANT SECTIONS HERE]`,
    video: null,
  },

  {
    title: 'Design and prototype UI components rapidly',
    category: 'Technology & Development',
    tool: 'Claude',
    description: 'Claude Design lets you create interactive UI prototypes directly from a description or rough sketch — without writing code or opening a design tool. Describe what you need and get a working, clickable prototype as an Artifact.\n\nIdeal for validating ideas quickly before committing to a full build, or getting early directional feedback from a client or stakeholder without spending design time on something that might change.',
    type: 'workflow',
    steps: [
      'Open Claude and start a new chat. Access Claude Design from the toolbar below the chat input (the paint palette icon).',
      'Describe the UI component or screen you need: "Build me a pricing table with three tiers — Starter, Pro, and Enterprise. Highlight the Pro tier. Include a monthly/annual toggle."',
      'Claude generates an interactive Artifact you can preview immediately. Click through it to check the interactions.',
      'Iterate in conversation: "Make the cards taller", "Change the highlight colour to match our brand", "Add a feature comparison table below the pricing cards."',
      'Once the direction is right, use the Artifact as a reference for a client presentation or hand the structure to a developer as a starting point.',
      'Export or screenshot the Artifact for use in a deck — or share the Claude conversation link directly with stakeholders.',
    ],
    video: null,
  },

  {
    title: 'Generate technical documentation from existing code',
    category: 'Technology & Development',
    tool: 'Claude',
    description: 'Documentation is the work that never gets done — until a handoff goes wrong. Paste your code and Claude generates a structured README, API reference, component guide, or developer onboarding doc automatically.\n\nKeeps documentation accurate and up to date without it becoming a separate workstream, and makes handoffs significantly cleaner for everyone who comes after you.',
    type: 'prompt',
    prompt: `Please generate technical documentation for the code below.

Documentation type needed:
[Choose one or more: README / API reference / Component guide / Developer onboarding guide / Inline code comments / Change log entry]

For each documentation type, include:

README:
- Project overview (what it does and why)
- Installation and setup steps
- Usage examples with code snippets
- Configuration options
- Known limitations or dependencies

API reference:
- Each endpoint or function: name, purpose, parameters (type + description), return value, example

Component guide:
- What the component does, its props/inputs, usage example, and any important behaviour notes

Format clearly with markdown headers and code blocks.

Code to document:
[PASTE YOUR CODE HERE]

Additional context:
Tech stack: [LANGUAGE / FRAMEWORK]
Audience for this documentation: [e.g. external developers / internal team / client handoff]`,
    video: null,
  },

  {
    title: 'Translate a client brief into a technical specification',
    category: 'Technology & Development',
    tool: 'Claude',
    description: 'Client briefs describe what they want to see. Technical specifications describe what needs to be built. The gap between the two is where projects go wrong. Claude bridges it — taking a creative or client brief and producing a structured technical specification with functional requirements, edge cases, and acceptance criteria.\n\nGives the development team clarity before a line of code is written, and gives the client something concrete to sign off on.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `Please translate the following brief from {{client_name}} into a structured technical specification for the development team at {{agency_name}}.

Deliver:
1. Project Overview (2–3 sentences — what is being built and why)
2. Functional Requirements (numbered list — what the system must do, written as "The system shall...")
3. Non-Functional Requirements (performance, browser support, accessibility, security considerations)
4. User Stories (key user journeys in "As a [user], I want to [action] so that [outcome]" format)
5. Edge Cases & Error States (what happens when things go wrong — empty states, errors, timeouts)
6. Out of Scope (what is explicitly NOT included in this build)
7. Acceptance Criteria (how we know each requirement is done — testable conditions)
8. Open Questions (things that need answering before development starts — flag clearly)

Client / creative brief:
[PASTE THE BRIEF HERE]

Tech constraints (if known):
Platform / framework: [e.g. WordPress / React / Shopify / custom build]
Browser / device support: [e.g. modern browsers, mobile-first]
Integration requirements: [e.g. must connect to Salesforce / Google Analytics / existing API]`,
    video: null,
  },

  // ── NEW ENTRIES FROM PROMPT LIBRARY v2 ───────────────

  {
    title: 'Write a case study for new business pitches',
    category: 'New Business & Strategy',
    tool: 'Claude',
    dpia: 'legal-review',
    description: 'Case studies that win new business are built on one headline result — not a page of metrics with a vague conclusion. Give Claude your campaign data and it identifies the most striking single result, anchors the narrative on that, and writes it in plain language with no agency clichés. Every claim is checked against your source material before it goes in.\n\nOutputs a results-led case study ready for pitch decks, plus a list of any gaps that need filling before it\'s publish-ready.\n\nData handling: Do not paste confidential client briefs, commercially sensitive metrics, or proprietary campaign results without first confirming your client contract permits use of AI tools for this material. Summarise or anonymise client-specific data where needed, or check with Legal before proceeding.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'sector', label: 'Sector' },
      { id: 'campaign_name', label: 'Campaign name' },
    ],
    prompt: `You are a senior agency strategist writing a case study for a new business pitch.

Source material:
- Client: {{client_name}}
- Sector: {{sector}}
- Campaign: {{campaign_name}}
- Brief: [PASTE ORIGINAL BRIEF OR ONE-LINE PROBLEM STATEMENT]
- Solution delivered: [DESCRIBE THE CREATIVE RESPONSE AND CHANNEL PLAN]
- Channels: [LIST CHANNELS]
- Timeframe: [START AND END DATES]
- Results (raw metrics): [PASTE AT LEAST 3 HARD METRICS WITH BASELINE OR TARGET]
- Testimonial (if any): [PASTE QUOTE OR WRITE "NONE"]

Method (work through these steps in order; do not skip):

Step 1. Read every input. List back to yourself the three most striking facts.
Step 2. Pick the single result that should anchor the headline. Choose the one that is largest, most surprising, or most strategically important.
Step 3. Identify the insight. Ask: what did the team see that others missed? Write it in one sentence before drafting anything else.
Step 4. Draft the case study using the structure below.
Step 5. Self-check: every claim must trace to a fact in the source material. Strike any that do not. Replace agency clichés ("leveraged", "synergy", "best-in-class", "unlocked") with plain verbs.
Step 6. Output the final case study and a list of any [GAP: ...] flags.

Structure:
1. Headline (under 12 words, results-led)
2. Challenge (60 words)
3. Insight (40 words; one sharp idea)
4. Solution (80 words; what we did, in plain language)
5. Results (3 bullets, each leading with a number)
6. Quote (use testimonial if provided; otherwise omit)

Constraints:
- UK English, active voice, short sentences
- Every claim traceable to a source fact
- For any section without enough evidence, write [GAP: needs input on X]`,
    video: null,
  },

  {
    title: 'Draft an RFP response to a client question',
    category: 'New Business & Strategy',
    tool: 'Claude',
    dpia: 'legal-review',
    description: 'RFP questions feel similar at first glance — but the wording a client chooses tells you exactly what they\'re looking for. Give Claude the question, your past credentials, and previous responses and it writes an answer matched precisely to the language of the question, anchored on one strong proof point. Anything it can\'t verify from the source material gets flagged rather than invented.\n\nParticularly useful when writing to a tight word limit under time pressure during a live pitch process.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
      { id: 'client_name', label: 'Client name' },
      { id: 'word_limit', label: 'Word limit' },
    ],
    prompt: `You are responding to a client RFP question on behalf of {{agency_name}}, part of Miroma Group.

Client RFP question:
[PASTE THE EXACT QUESTION VERBATIM]

Word limit: {{word_limit}}
Required format: [TABLE / NARRATIVE / BULLETS]

Reference material from past responses and credentials:
[PASTE 2–4 RELEVANT PAST RESPONSES OR CAPABILITY STATEMENTS]

Agency capabilities relevant to this question:
[SUMMARISE THE CAPABILITIES THAT SPEAK TO THIS QUESTION]

Client context (sector, named pain points from the RFP intro):
[DESCRIBE WHAT YOU KNOW ABOUT {{client_name}}]

Method:

Step 1. Read the question twice. Underline the key noun and the key verb. The answer must address both.
Step 2. Scan the reference material. Mark which past response or capability matches the question most closely.
Step 3. Adapt that match to the exact wording of the question. Do not paste boilerplate.
Step 4. Pick one proof point: a named client (if cleared), a specific metric, or a project we can describe in one line.
Step 5. Cut to the word limit. Cut adjectives first.
Step 6. Self-check: any claim not anchored in the reference material gets a [VERIFY: ...] tag or comes out.

Output:
- The answer only (no preamble, no explanation of your method)
- A separate list at the end: any [VERIFY: ...] flags raised

Do not invent statistics, client names, or capabilities not present in the source material.`,
    video: null,
  },

  {
    title: 'Build a daily client account digest',
    category: 'Account Management',
    tool: 'Claude',
    dpia: 'legal-review',
    description: 'Account teams managing multiple clients can spend the first hour of every morning just catching up — emails, performance alerts, project updates, and news across every account. Paste the last 24 hours of activity into Claude and get a single morning briefing under 250 words: only what\'s genuinely new, each item leading with the fact rather than background.\n\nParticularly useful for account teams managing multiple active clients across different time zones.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
    ],
    prompt: `You are preparing the morning digest for the {{client_name}} account team.

Inputs from the past 24 hours:
- Client emails or messages (anonymised where rules require): [PASTE OR SUMMARISE COMMS]
- Project status updates (one line per project): [PASTE PROJECT UPDATES]
- Campaign performance flags (only metrics breaching thresholds): [PASTE ALERTS OR "NONE"]
- Industry news relevant to client sector: [PASTE 3–5 NEWS ITEMS WITH BRIEF SUMMARIES]
- Internal team notes and milestones: [PASTE OR "NONE"]

Method:

Step 1. Identify what is genuinely new since yesterday. Discard repeats and routine status.
Step 2. Sort by action required: items that need a decision or response today, items to watch, items that are background colour.
Step 3. From the news, pick the single item that most affects the client's business, work, or upcoming campaigns. Discard the rest.
Step 4. From the comms, infer mood: anything in tone or pace that the team should know before their next interaction?
Step 5. Compress to the digest format. Lead each item with the fact, not the source.
Step 6. Self-check: total under 250 words, no filler, no section heading without content.

Digest structure:
1. Need-to-know today (max 3 items, action required)
2. Live campaigns at a glance (one line each, status + flag)
3. Client context (anything mood-shifting from comms)
4. Sector signal (one news item, with the so-what)
5. Team milestones (birthdays, anniversaries) — first names only

Constraints:
- Total under 250 words
- Lead each item with the fact, not the source
- If nothing changed in a section, omit it`,
    video: null,
  },

  {
    title: 'Identify growth opportunities in an existing account',
    category: 'Account Management',
    tool: 'Claude',
    dpia: 'dpia-required',
    description: 'Growing an existing account well means knowing which conversations to have, when to have them, and how to frame the ask. Give Claude the client\'s history, current scope, and your available services and it surfaces three ranked growth opportunities — each with a proposed conversation opener, a realistic revenue estimate, and an honest read on the risk. It also flags one opportunity to decline and one question to test before committing to any of them.\n\nThe kind of analysis that usually takes a half-day strategy session, done in a single conversation.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'sector', label: 'Sector' },
    ],
    prompt: `You are an account director identifying growth opportunities for {{client_name}}.

Client account history (sanitised, no individuals named):
- Engagement length: [NUMBER OF MONTHS/YEARS]
- Services delivered to date: [LIST ALL SERVICES]
- Annual revenue trend (last 3 years): [e.g. £200k → £210k → £195k]
- Capability adjacencies not yet sold: [LIST SERVICES THE AGENCY OFFERS BUT HAS NOT SOLD HERE]
- Recent client priorities (from briefs, calls): [DESCRIBE 3–5 THEMES THE CLIENT IS FOCUSED ON]

Industry benchmarks (peer accounts in {{sector}}):
[DESCRIBE WHAT SIMILAR CLIENTS BUY — OR "NO DATA AVAILABLE"]

Method:

Step 1. Plot the client's trajectory: are they growing, plateauing, or declining with us? Identify the inflection point if there is one.
Step 2. Compare service-list breadth against peer accounts at similar revenue. Note where peers buy more capabilities than this client does.
Step 3. From the priority signals, identify 3 to 5 themes the client is investing energy in this year.
Step 4. Cross-reference: which adjacent services match a priority theme? Those are hypotheses.
Step 5. For each hypothesis, write: the evidence base, the proposed first conversation, the deal-size estimate range, the risk of asking.
Step 6. Identify one opportunity to decline (over-reach, capability gap, relationship risk).
Step 7. Identify the single question to test with the client lead before any of this is actioned.

Output:
1. One-paragraph trajectory diagnosis
2. Three growth hypotheses ranked by fit and likely deal size
3. One opportunity to decline with reason
4. One validation question for the client lead
5. Confidence note: any [LOW CONFIDENCE: <why>] flags

Constraints:
- Tie every hypothesis to specific evidence in the inputs
- No invented figures`,
    video: null,
  },

  {
    title: 'Ghostwrite thought leadership for a senior author',
    category: 'PR & Communications',
    tool: 'Claude',
    dpia: 'standard',
    description: 'Good ghostwriting starts with the voice, not the argument. Give Claude a sample of the author\'s writing and it picks up their sentence rhythm, vocabulary, and how they open and close — then writes the full piece in that voice, built around one clear argument from start to finish. No bullet points, no management-speak, no hedging.\n\nOutputs the headline, the full piece ready to publish, and three LinkedIn caption variants for amplification.',
    type: 'prompt',
    variables: [
      { id: 'author_name', label: 'Author name' },
      { id: 'author_role', label: 'Author role/title' },
      { id: 'agency_name', label: 'Agency name' },
    ],
    prompt: `You are ghostwriting a thought leadership piece for {{author_name}}, {{author_role}} at {{agency_name}}.

Author's voice sample (recent published writing or transcript — 300+ words ideally):
[PASTE VOICE SAMPLE]

Source bullets and rough notes the piece should expand from:
[PASTE ROUGH NOTES]

Piece type: [LINKEDIN POST 250 WORDS / BLOG 800 WORDS / OP-ED 600 WORDS]
Audience: [DESCRIBE WHO WILL READ THIS]
Single thing the reader should take away: [THE ONE IDEA]
Hook (a recent trigger that makes this timely): [DESCRIBE THE HOOK]

Method:

Step 1. Analyse the voice sample. Note: average sentence length, vocabulary register, use or avoidance of metaphor, opening style, closing style.
Step 2. From the rough notes, pick the single sharpest argument. Discard anything that distracts from it.
Step 3. Open with the hook. Earn the reader's attention in the first two sentences.
Step 4. Build the argument: claim, reasoning, evidence, counterpoint addressed, conclusion.
Step 5. Close with a sentence that lands the takeaway. Not a question, not a CTA — an idea.
Step 6. Match the voice. Read it back as if it were the author speaking. If it sounds like AI, rewrite.
Step 7. Self-check: one argument throughout, no clichés, no platitudes, no bullet lists in the body, factual claims tagged [VERIFY: ...] where needed.

Output:
1. Headline (under 12 words)
2. The piece in the author's voice, length as specified
3. Three suggested LinkedIn caption variants if format is blog/op-ed

Constraints:
- Match the voice sample for sentence length, vocabulary, and rhythm
- One argument, not five
- No bullet point lists in the body
- Flag factual claims that need verification: [VERIFY: <claim>]`,
    video: null,
  },

  {
    title: 'Shortlist influencer talent for a campaign',
    category: 'Social Media',
    tool: 'Claude',
    dpia: 'client-check',
    description: 'Influencer selection is part instinct, part data — and the wrong picks are expensive to unwind. Give Claude your campaign brief and a list of creators to evaluate and it assesses each one against audience fit, engagement quality, brand alignment, risk, and cost. You get a ranked shortlist of eight, a do-not-list with clear reasons for each, three audience personas surfaced from the pool, and the gap in the list that\'s worth going back to fill.\n\nAssessments use public data only — unusual engagement patterns that may indicate bot activity are flagged.',
    type: 'prompt',
    variables: [
      { id: 'brand_name', label: 'Brand name' },
      { id: 'campaign_name', label: 'Campaign name' },
    ],
    prompt: `You are an influencer strategist shortlisting talent for {{brand_name}} for {{campaign_name}}.

Campaign brief:
- Objective: [DESCRIBE THE CAMPAIGN OBJECTIVE]
- Target audience: [DESCRIBE THE TARGET AUDIENCE]
- Brand values and red lines: [LIST VALUES AND ANY HARD NOs]
- Budget tier: [e.g. micro / mid-tier / macro]
- Format: [e.g. Instagram Reels, TikTok]
- Region: [e.g. UK]

Influencer pool (from research tool, public data only — handle, follower count, engagement rate, top content categories, recent posts, audience demographics where available):
[PASTE INFLUENCER DATA]

Method:

Step 1. For each influencer, score on five dimensions, H/M/L:
   - Audience fit (demographic and psychographic overlap with target)
   - Engagement quality (rate, comment depth, not raw count)
   - Brand-value alignment (recent content match)
   - Risk (controversies, brand conflicts, paid-post saturation)
   - Likely cost relative to tier
Step 2. Where engagement looks anomalous (very high follower count, very low comment depth), flag bot-quality concerns.
Step 3. Eliminate red-flag profiles immediately. Note them in the do-not-list with reason.
Step 4. Cluster the remaining pool into 3 audience personas based on follower demographics and content style.
Step 5. Identify the gap: a profile type the pool is missing for this brief.
Step 6. Rank top 8 by combined fit and quality.

Output:
1. Top 8 ranked, with one-line rationale each
2. Three to avoid, with reason
3. Three audience personas the pool clusters into
4. One gap: a profile type the pool is missing

Constraints:
- Use only data in the pool. Do not infer follower counts or rates.
- Flag risk: [RISK: <reason>]
- Flag bot quality: [QUALITY CHECK]`,
    video: null,
  },

  {
    title: 'Analyse ad creative performance data',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    dpia: 'client-check',
    description: 'When you\'re running multiple creatives simultaneously, knowing what to scale, kill, or test is what drives performance — but the analysis usually sits in a spreadsheet nobody has time to read properly. Give Claude your creative performance data and it ranks each asset by the right metric, identifies what the top performers have in common, and gives each creative a clear next-step recommendation.\n\nCreatives below the minimum sample size are flagged rather than concluded on — so the team is acting on data, not noise.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'date_range', label: 'Date range' },
    ],
    prompt: `You are running an ad creative performance analysis for {{client_name}}.

Question being answered:
[STATE THE SPECIFIC QUESTION — e.g. "Which creative format is driving the lowest CPA?"]

Date range: {{date_range}}
Audience scope: [DESCRIBE THE SEGMENT OR CAMPAIGN]
Minimum reliable sample size: [e.g. 1,000 impressions]

Performance data (export by creative, with metrics — impressions, clicks, CTR, conversions, CPC, CPA, frequency):
[PASTE PERFORMANCE DATA]

Benchmark or comparator (prior period, other creatives, or category norm):
[PASTE BENCHMARK DATA OR "NONE"]

Method:

Step 1. Answer the question first, in one paragraph. Do not lead with caveats.
Step 2. Sort creatives by the metric that best answers the question (CTR for engagement, CPA for efficiency, conversions for outcome).
Step 3. Identify top 3 and bottom 3.
Step 4. Look across the top 3 for patterns: format, message, hook, audience, time of day. Anything common is a signal.
Step 5. Compare against benchmark. Note where top performers also beat benchmark and where they only beat their peers.
Step 6. For each creative below the minimum sample size, flag [LOW SAMPLE]. Do not draw conclusions from these.
Step 7. Recommend an action for each creative: KEEP, KILL, TEST_VARIANT.
Step 8. Confidence note: state where the data is too thin to conclude.

Output:
1. Direct answer to the question (one paragraph)
2. Top 3 performing creatives, with the metric that earned the rank
3. Bottom 3, with what is dragging performance
4. Pattern: anything common across top performers
5. Recommended action per creative: KEEP, KILL, or TEST_VARIANT
6. Confidence note: where sample size is too small

Constraints:
- Use only the provided data
- No invented benchmarks
- Flag [LOW SAMPLE] for any creative under the minimum threshold`,
    video: null,
  },

  {
    title: 'Draft a media booking confirmation email',
    category: 'Media Planning & Buying',
    tool: 'Claude',
    dpia: 'client-check',
    description: 'A booking confirmation with a wrong figure creates billing and compliance problems that take far longer to fix than the original error took to make. Give Claude your media plan details and it drafts a complete vendor confirmation with every figure taken directly from the plan — checking for missing fields before starting rather than after. A follow-up chaser is included automatically for when the vendor doesn\'t respond.',
    type: 'prompt',
    variables: [
      { id: 'vendor_name', label: 'Vendor name' },
      { id: 'client_name', label: 'Client name' },
      { id: 'campaign_name', label: 'Campaign name' },
    ],
    prompt: `You are a media buyer drafting a booking confirmation email to {{vendor_name}}.

Booking details (from the plan):
- Client: {{client_name}}
- Campaign: {{campaign_name}}
- Placement: [PLACEMENT NAME / FORMAT]
- Dates: [FLIGHT START AND END DATES]
- Spend: [CONFIRMED SPEND AMOUNT]
- Targeting: [DESCRIBE TARGETING PARAMETERS]
- Creative spec: [FORMAT, DIMENSIONS, FILE TYPE]
- Asset deadline: [DATE CREATIVE IS DUE TO VENDOR]
- PO number (if available): [PO NUMBER OR "TBC"]

Vendor relationship context:
[e.g. long-standing partner / first booking / made-good owed from last campaign]

Named contact for queries: [FULL NAME AND EMAIL]

Method:

Step 1. Check completeness. If any essential booking field is missing, flag [MISSING: <field>] and stop until provided.
Step 2. Draft the subject line: under 10 words, includes campaign and dates so the vendor can find it later.
Step 3. Open with the relationship context: warm if long-standing, neutral if first booking. One line.
Step 4. State the booking. Every figure verbatim from the plan, in a clean list.
Step 5. State what is needed back: confirmation, asset deadline acknowledgement, any vendor sign-off required.
Step 6. Close with one named contact. No "feel free to reach out to anyone".
Step 7. Draft a short follow-up version under 80 words for chasing if no response.
Step 8. Self-check: no commitments beyond what is in the plan, no rate negotiations, no scope changes.

Output:
1. Subject line
2. Email body (full)
3. Short version for follow-up

Constraints:
- UK English, formal-but-friendly
- All figures verbatim from the plan
- No commitment beyond what is booked
- Flag missing essentials: [MISSING: <field>]`,
    video: null,
  },

  {
    title: 'Reconcile an invoice against the media plan',
    category: 'Finance',
    tool: 'Claude',
    dpia: 'legal-review',
    description: 'Invoice reconciliation is error-prone when done manually — especially on high-volume buys with multiple vendors. Paste your media plan and invoice and Claude does the matching: flagging what\'s within tolerance, what needs querying, and what shouldn\'t be on the invoice at all. Vendor name mismatches are caught separately, which is where most audit issues hide even when the amounts look right.\n\nOutputs are recommendations only — Claude never approves spend.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'tolerance', label: 'Agreed tolerance (e.g. ±2%)' },
    ],
    prompt: `You are reconciling a vendor invoice against the booked media plan for {{client_name}}.

Media plan (line items — vendor, placement, gross cost, client cost, dates):
[PASTE MEDIA PLAN ROWS]

Invoice received (line items — vendor, description, amount, date):
[PASTE INVOICE ROWS]

Agreed tolerance: {{tolerance}}
Known approved exceptions (rate-card changes, make-goods): [LIST OR "NONE"]

Method:

Step 1. Normalise both datasets: same vendor name spellings, same date formats, same currency.
Step 2. For each invoice line, find the best matching plan line by vendor, placement, and date.
Step 3. Compare amounts. Apply the tolerance band. Classify each line: EXACT, WITHIN_TOLERANCE, OVER_TOLERANCE, MISSING_FROM_INVOICE, NOT_ON_PLAN.
Step 4. For OVER_TOLERANCE: check if it matches a known approved exception. If yes, note this. If no, flag for query.
Step 5. For NOT_ON_PLAN lines: examine the description. Is it a likely typo, a vendor consolidation, or a genuine new charge?
Step 6. For vendor name mismatches even where amounts agree: flag separately.
Step 7. Recommend next steps line by line: approve, query vendor, escalate.

Output:
1. Reconciliation table: | Plan line | Invoice line | Match status | Variance | Notes |
2. Exceptions list: every line not in EXACT status, with a one-line explanation
3. Vendor-name mismatch list (separate)
4. Recommended actions, grouped by approve / query / escalate
5. Any [DATA ISSUE: <description>] flags if data is malformed

Constraints:
- Do not approve anything; recommend only
- Do not pad totals to make them match
- If data is malformed, stop and output [DATA ISSUE: ...] rather than guess`,
    video: null,
  },

  {
    title: 'Draft forecast commentary from finalised figures',
    category: 'Finance',
    tool: 'Claude',
    dpia: 'legal-review',
    description: 'Forecast commentary is often the last thing anyone gets to — but vague language like "margin pressure" doesn\'t serve a finance audience. Give Claude your finalised figures and the context behind the variances and it writes a specific, quantified narrative: each variance paired to its probable driver, underlying performance separated from one-off items, every claim grounded in the data provided.\n\nRequires Finance to finalise figures first — Claude writes around numbers, it doesn\'t generate them.',
    type: 'prompt',
    variables: [
      { id: 'entity_name', label: 'Entity / business unit name' },
      { id: 'period', label: 'Forecast period (e.g. Q3 2026)' },
    ],
    prompt: `You are drafting commentary for the {{period}} forecast for {{entity_name}}.

Forecast figures (already finalised by Finance — do not change):
[PASTE FORECAST TABLE]

Drivers and assumptions:
[LIST THE KEY ASSUMPTIONS BEHIND THE FORECAST]

Variance vs prior forecast:
[DESCRIBE OR PASTE VARIANCE DATA]

Variance vs budget:
[DESCRIBE OR PASTE BUDGET VARIANCE DATA]

Risks and opportunities tracked:
[LIST RISKS AND OPPORTUNITIES WITH QUANTIFIED IMPACT WHERE POSSIBLE]

One-off items (already separated from underlying):
[LIST OR "NONE"]

Method:

Step 1. Read the figures. Identify the three movements that most need explaining: largest variance, biggest reversal, biggest unexpected gain or loss.
Step 2. For each movement, find the driver in the assumptions list. Pair them.
Step 3. Distinguish underlying from one-off. Talk about underlying first.
Step 4. Quantify everything. "Margin pressure" is unhelpful; "margin down 1.4 points driven by X" is the standard.
Step 5. Risks and opportunities: include only those with a quantified upside or downside, or a clearly named trigger.
Step 6. Self-check: every figure quoted exactly as supplied. No estimation. No softening language.

Output sections:
1. Headline (5 sentences max)
2. Drivers explanation (revenue, costs, margin)
3. Variance commentary (vs budget, vs prior forecast)
4. Risks and opportunities, with quantified impact
5. Watch items for next forecast cycle

Constraints:
- Use only the figures supplied. Do not estimate or extrapolate.
- Active voice. Drop "we are pleased to report" phrasing.
- Flag inconsistent inputs: [INCONSISTENT INPUT: <details>]`,
    video: null,
  },

  {
    title: 'Create a production call sheet from pre-pro notes',
    category: 'Creative & Production',
    tool: 'Claude',
    dpia: 'client-check',
    description: 'A complete call sheet means pulling together the header, daily schedule, locations, talent call times, and crew by department — all from pre-production notes that are rarely in a consistent format. Give Claude your pre-pro docs and it assembles a structured first draft with everything in the right place. Any information missing from the source material is flagged clearly rather than filled in.\n\nPersonal contact details are kept out of the draft stage and added at the final review.',
    type: 'prompt',
    variables: [
      { id: 'production_name', label: 'Production name' },
      { id: 'shoot_date', label: 'Shoot date' },
    ],
    prompt: `You are producing a call sheet for {{production_name}} on {{shoot_date}}.

Source materials:
- Pre-production notes: [PASTE PRE-PRO NOTES]
- Schedule outline: [PASTE SCHEDULE OR DESCRIBE SCENE ORDER AND TIMING]
- Talent details (names and roles only at draft — no contact details): [PASTE TALENT LIST]
- Crew list: [PASTE CREW LIST BY DEPARTMENT]
- Location details (addresses, parking, access notes): [PASTE LOCATION INFO]
- Catering: [DESCRIBE ARRANGEMENTS OR "TBC"]
- Weather and contingency plan: [PASTE OR "SEE PRODUCER"]

Standard call sheet template (or describe the format you use):
[PASTE TEMPLATE OR WRITE "USE STANDARD FORMAT"]

Method:

Step 1. Build the header: production, date, weather, sunrise/sunset (calculate from location and date if not supplied), key contacts.
Step 2. Lay out the schedule in 24-hour format, with department call times keyed to scene start.
Step 3. List locations with addresses and parking notes. Cross-check that each scheduled scene has a location.
Step 4. Build the talent table. At draft stage: names, roles, and call times only. No phone numbers, no addresses.
Step 5. Build the crew table by department.
Step 6. Compile notes: H&S, special instructions, weather contingency.
Step 7. Self-check every section. For any gap, flag [NEEDS INPUT: <item>].
Step 8. Final note: contacts to be added under separate review at finalisation. Do not include personal contact details in this draft.

Output sections:
1. Header block: production, date, weather, sunrise/sunset, key contacts
2. Schedule by time, with department call times
3. Locations with addresses and parking notes
4. Talent table (names and call times only at draft)
5. Crew table by department
6. Notes section: H&S, special instructions, weather contingency

Constraints:
- Use only details from the source. For gaps: [NEEDS INPUT: <item>]
- No personal contact details in draft output
- Time format 24-hour
- UK English`,
    video: null,
  },

  {
    title: 'Company Intel Platform',
    category: 'finance',
    tool: 'Our Build',
    type: 'custom-build',
    description: "Automates due diligence and corporate monitoring across any UK company. Add a business to your watchlist and the platform continuously monitors Companies House for director changes, overdue accounts, and financial stress signals — automatically extracting key metrics like turnover, net assets, and cash position from filed accounts. A 0–100 risk score combines governance, financial health, liquidity, and reputational data, with real-time email alerts on critical RED flags.",
    status: 'dev',
    agencies: ['Group-wide', 'Finance', 'Legal'],
    demoUrl: null,
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Company Intel Platform',
  },

  {
    title: 'Adobe Clipping Solution',
    category: 'creative-production',
    tool: 'Our Build',
    type: 'custom-build',
    description: "Automates the entire social clipping workflow inside Adobe Premiere Pro. Teams upload a spreadsheet with in/out timecodes and the script handles the rest: auto-clipping, AI-powered speaker reframing, subtitle transcription, and batch export of social-ready 9:16 videos — eliminating hours of repetitive manual work per week. Reach out to the AI team for instructions on how to install the extension.",
    status: 'live',
    agencies: ['Multiple', 'Buzz16'],
    demoUrl: 'https://www.loom.com/share/027243d6b26843ba864698baabb7a845',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Adobe Clipping Solution',
  },

  {
    title: 'Maker Lab Interview Automation',
    category: 'hr-people',
    tool: 'Our Build',
    type: 'custom-build',
    description: "Automates Maker Lab's recruitment pipeline end to end. Google Meet interview transcripts are picked up automatically, analysed by AI against the job description, and structured candidate profiles — skills, salary, notice period, availability — are generated and synced directly into Workable ATS. Recruiters review and share profiles with one click. Clients get clean, consistent candidate summaries.",
    status: 'live',
    agencies: ['Maker Lab'],
    demoUrl: 'https://www.loom.com/share/f2112396308b4f8ca6839a684d8645ec',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Maker Lab Interview Automation',
  },

  {
    title: 'Meta Campaign Automation',
    category: 'media-planning-buying',
    tool: 'Our Build',
    type: 'custom-build',
    description: "Removes the manual effort from Meta paid media campaign setup. The Sold Out digital team upload a CSV file, the platform builds the full campaign architecture automatically, and it's ready to activate. Now embedded in the Sold Out workflow and the first step in a broader media automation programme, with plans to extend to other platforms and agencies across the group.",
    status: 'live',
    agencies: ['Sold Out'],
    demoUrl: 'https://www.loom.com/share/2e21c14a70614136974b3ed04095e13c',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Meta Campaign Automation',
  },

  {
    title: 'PR Daily Coverage',
    category: 'pr-communications',
    tool: 'Our Build',
    type: 'custom-build',
    description: "Two PR coverage platforms purpose-built for StoryHouse's theatre clients and Multiple's film clients. The system monitors news sources and publications daily, automatically surfacing reviews, features, and mentions relevant to each show or film in the portfolio. It then assembles a formatted daily coverage report — giving PR teams a complete picture of what's been written without manually trawling dozens of outlets each morning.",
    status: 'live',
    agencies: ['StoryHouse', 'Multiple'],
    demoUrl: null,
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — PR Daily Coverage',
  },

  {
    title: 'Data Parsing & Tag Request Automation',
    category: 'media-planning-buying',
    tool: 'Our Build',
    type: 'custom-build',
    description: "Streamlines Spot Co's tag request workflow by automating the data flow from insertion order to media plan to tag request sheet — eliminating the double-keying of data and freeing the team to focus on higher-value work. Enables faster campaign setup and delivery while reducing human error throughout the process.",
    status: 'live',
    agencies: ['Spot Co'],
    demoUrl: 'https://www.loom.com/share/128328f59d05464581cf1d7ca609c8dd',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Data Parsing & Tag Request Automation',
  },

  {
    title: 'Contract Management System',
    category: 'legal',
    tool: 'Our Build',
    type: 'custom-build',
    description: "An AI-powered contract review and approval platform handling the entire lifecycle from upload to e-signature. Upload any NDA, client contract, or supplier agreement and the platform produces an executive summary, extracts key commercial terms, flags red clauses against Miroma's own policy, and risk-scores the contract. It then flows through a structured multi-stage approval process — Submitter → Finance → Agency → Legal — before being sent automatically for e-signature via DocuSign, with role-based access, email notifications, and a full audit trail throughout.",
    status: 'dev',
    agencies: ['Group-wide', 'Legal'],
    demoUrl: 'https://www.loom.com/share/8a09b9651d0341779ec37aa1608f501a',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Contract Management System',
  },

  {
    title: 'Media Platform',
    category: 'media-planning-buying',
    tool: 'Our Build',
    type: 'custom-build',
    description: "A centralised platform to transform how media services are delivered across Miroma Group — from brief intake through to reporting. Each agency gets their own view of the platform, streamlining everything from client brief and AI media planning, through campaign activation and ad trafficking, to real-time performance dashboards and group finance integration. Designed to move the group from fragmented, Excel-based workflows to a scalable, intelligent media ecosystem.",
    status: 'scoping',
    agencies: ['MX UK', 'MX US', 'Attentive', 'Spot Co', 'Dewynters', 'MFN', 'Sold Out'],
    demoUrl: null,
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Media Platform',
  },

  // ── V3 Supplement prompts ─────────────────────────────

  {
    title: 'Brand Strategy Synthesiser',
    category: 'New Business & Strategy',
    description: 'Most brand strategy outputs are 40-slide decks that nobody reads twice. Give Claude the brand assets, audience insights, and competitor positioning and it synthesises everything down to a single strategic platform statement — one sharp idea the team can actually build from.\n\nUseful at the start of a brand project or when repositioning work has generated too many possible directions and needs to be distilled into something clear.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'positioning_doc', label: 'Positioning statement' },
      { id: 'tone_of_voice', label: 'Tone of voice document' },
      { id: 'brand_guidelines_extract', label: 'Brand guidelines extract' },
      { id: 'audience_insights', label: 'Audience research insights (1–3 key findings)' },
      { id: 'competitor_notes', label: 'Competitor positioning notes (3–5 competitors)' },
      { id: 'tension', label: 'Category or cultural tension to navigate' },
      { id: 'business_objectives', label: 'Business objectives (next 12–24 months)' },
      { id: 'red_lines', label: 'Client constraints and red lines' },
    ],
    prompt: `You are a brand strategist synthesising research into a brand strategy for {{client_name}}.

Existing brand assets:
{{positioning_doc}}
{{tone_of_voice}}
{{brand_guidelines_extract}}

Audience research insights:
{{audience_insights}}

Competitor positioning:
{{competitor_notes}}

Category or cultural tension to navigate:
{{tension}}

Business objectives (12 to 24 months):
{{business_objectives}}

Client constraints and red lines:
{{red_lines}}

Method:

Step 1. Read every input. List the three audience truths most relevant to the business objectives. Strike anything generic.
Step 2. Identify the one tension worth solving. A real tension has both sides true; if either side is weak, keep looking.
Step 3. Map the competitor space. Where is each competitor playing? Find the unowned territory.
Step 4. Draft a strategic platform: a single sentence under 25 words that names the tension, the role the brand plays, and the audience it serves.
Step 5. Build out the architecture: the audience (in their words, not demographic clichés), the brand's role, the central message, three reasons to believe.
Step 6. Pressure-test. Could a competitor say this with a logo swap? If yes, sharpen. Does it serve the business objectives directly? If not, reframe.
Step 7. Self-check: every claim traceable to the source material. No platitudes. No "authentic", "purposeful", "iconic" without a working definition.

Output:
1. Strategic platform statement (under 25 words)
2. The tension (one sentence)
3. Audience (one paragraph in their language)
4. Brand role
5. Central message
6. Three reasons to believe, each with a source-anchored proof point
7. What this strategy lets us say no to (define by exclusion)
8. Open questions for the client where evidence is thin

Constraints:
- No "authentic", "iconic", "purposeful" without a working definition
- No claim without a source in the inputs
- One idea, not five`,
  },

  {
    title: 'Pitch Strategy & Plan',
    category: 'New Business & Strategy',
    description: 'Pitch decks that don\'t win are usually built before the strategy is clear. Give Claude the brief, your agency context, and what you know about the client and it develops the pitch strategy first: one clear positioning, the real need behind each stated objective, and a narrative arc structured to address the angles your competitors are likely to take.\n\nUse this before opening the deck — not while building it.',
    type: 'prompt',
    variables: [
      { id: 'agency', label: 'Agency name' },
      { id: 'prospect', label: 'Prospect name' },
      { id: 'brief', label: 'Brief or RFP' },
      { id: 'eval_criteria', label: 'Stated objectives and evaluation criteria' },
      { id: 'prospect_intel', label: 'Prospect intelligence (priorities, news, leadership)' },
      { id: 'history', label: 'History with this prospect' },
      { id: 'team_and_time', label: 'Pitch team and time available' },
      { id: 'competitor_angles', label: 'Likely competitors and their predicted angles' },
      { id: 'credentials', label: 'Agency credentials relevant to this brief' },
    ],
    prompt: `You are pitch lead for {{agency}} pitching {{prospect}}. Build the pitch strategy.

Brief or RFP:
{{brief}}

Stated objectives and evaluation criteria:
{{eval_criteria}}

Prospect intelligence:
{{prospect_intel}}

History with this prospect:
{{history}}

Pitch team and time available:
{{team_and_time}}

Likely competitors and their predicted angles:
{{competitor_angles}}

Agency credentials relevant to this brief:
{{credentials}}

Method:

Step 1. Read the brief twice. Identify the unstated need behind each stated objective. The stated brief is the floor; the pitch wins on the unstated.
Step 2. Map the evaluation criteria to where we are demonstrably strong, weak, or untested. Be honest about the weak ones.
Step 3. Profile the room. Who decides? What are they each most likely worried about? Address each worry once.
Step 4. Pick the single positioning. We are the agency that does X best, while competitor A will pitch Y and competitor B will pitch Z. Pre-empt their angles.
Step 5. Choose the demonstration. The thing the prospect remembers is rarely the chart. It is the case, the prototype, the conversation, the one number. Pick one demonstration that proves the positioning.
Step 6. Build the pitch arc: opening hook, problem framing, our take, proof, the demonstration, the team, the ask. One narrative, not five sections.
Step 7. Identify the risks: where could this go wrong, and what is the contingency for each?
Step 8. Self-check: would competitors A and B agree with our positioning? If yes, it is not differentiated.

Output:
1. Single-sentence positioning (under 25 words)
2. The unstated need behind each stated objective
3. Room map: each decision-maker, their concern, our response
4. Pitch arc (7 beats, 1 line each)
5. The chosen demonstration and why it proves the positioning
6. Team selection and the role each person plays in the room
7. Three risks and contingencies
8. Decisions still needed before deck build starts

Constraints:
- Strategy first; no slide structure until the strategy is locked
- Honest assessment of weak evaluation criteria
- One positioning, not three`,
  },

  {
    title: 'Sales Performance Commentary Writer',
    category: 'Finance',
    description: 'Sales commentary is easy to write vaguely and hard to write well. Give Claude the period\'s figures, comparators, marketing activity, and context — and it writes a commentary that connects each significant movement to its most probable cause, separates what the team controlled from what the market did, and surfaces the one finding that tends to get missed in a standard readout.\n\nOutputs a headline summary, movement analysis table, and three recommended actions for next period.',
    type: 'prompt',
    variables: [
      { id: 'period', label: 'Reporting period' },
      { id: 'client_or_show', label: 'Client or show name' },
      { id: 'sales_figures', label: 'Sales performance figures for the period' },
      { id: 'prior_period_and_target', label: 'Comparator data (prior period, prior year, target)' },
      { id: 'marketing_activity', label: 'Marketing and channel activity in period' },
      { id: 'external_factors', label: 'External factors affecting demand' },
      { id: 'pricing_activity', label: 'Pricing or discount activity in period' },
      { id: 'distribution_changes', label: 'Distribution changes (agents, retailers, channels)' },
    ],
    prompt: `You are a sales analyst writing the {{period}} performance commentary for {{client_or_show}}.

Performance data:
{{sales_figures}}

Comparators:
{{prior_period_and_target}}

Marketing and channel activity in period:
{{marketing_activity}}

External factors:
{{external_factors}}

Pricing and discount activity:
{{pricing_activity}}

Distribution changes:
{{distribution_changes}}

Method:

Step 1. Read the sales data. Identify the three largest movements vs comparator (positive or negative).
Step 2. For each movement, list the candidate causes from the activity, external, pricing, and distribution inputs. Rank by likely contribution.
Step 3. Distinguish what the team did (controllable) from what happened to the market (uncontrollable). Label each cause accordingly.
Step 4. For controllables that worked: name the activity, link to the metric movement, suggest amplification.
Step 5. For underperformance: identify whether it was activity (do less / pivot), market (accept / hedge), or execution (fix).
Step 6. Surface one finding the team probably did not expect. The "we already knew that" findings get one line each.
Step 7. Self-check: no figure invented, no causal link claimed without an input that supports it (use [INFERRED] tag if claiming inference).

Output:
1. Headline (3 sentences: top-line position vs comparator, key driver, key risk)
2. Movement table: top 5 metric movements, with probable cause and confidence
3. What worked (controllables, with amplification idea)
4. What did not work (with diagnosis: activity / market / execution)
5. One unexpected finding
6. Recommended actions for next period (max 3, each tied to a finding)

Constraints:
- Distinguish controllable from uncontrollable
- Tag inferences: [INFERRED]
- No celebratory language`,
  },

  {
    title: 'Discounting Strategy Recommendation',
    category: 'Finance',
    description: 'Discounting works best when it\'s targeted and worst when it\'s reflexive. Give Claude your pricing structure, sales velocity, inventory position, and audience data and it diagnoses the underlying problem before recommending anything. Three discount options are then generated and ranked by likely sales impact, with your floor price and brand constraints respected throughout.\n\nOutputs the recommended approach with the evidence behind it — so the decision goes to the team with clear analysis, not just a list of options.',
    type: 'prompt',
    variables: [
      { id: 'show_or_product', label: 'Show or product name' },
      { id: 'time_window', label: 'Time window' },
      { id: 'pricing_structure', label: 'Current pricing structure (full price, discounts, codes)' },
      { id: 'velocity_data', label: 'Sales velocity (last 8+ weeks)' },
      { id: 'inventory_position', label: 'Inventory or capacity remaining' },
      { id: 'audience_segments', label: 'Audience segments and price sensitivity' },
      { id: 'past_campaigns', label: 'Past discount campaign performance' },
      { id: 'constraints', label: 'Brand / client constraints (floor price, never-discount windows)' },
      { id: 'competitor_data', label: 'Competitor pricing and discount activity' },
    ],
    prompt: `You are a revenue strategist recommending a discount approach for {{show_or_product}} for {{time_window}}.

Current pricing:
{{pricing_structure}}

Sales velocity (recent 8+ weeks):
{{velocity_data}}

Inventory or capacity remaining:
{{inventory_position}}

Audience segments and price sensitivity:
{{audience_segments}}

Past discount campaign performance:
{{past_campaigns}}

Brand and client constraints:
{{constraints}}

Competitor pricing and discount activity:
{{competitor_data}}

Method:

Step 1. Diagnose the problem. Is this a velocity issue (sales pace too slow), a capacity issue (too much inventory unsold), an audience reach issue (wrong people seeing the price), or a perception issue (priced wrong vs competitors)? Name it.
Step 2. From past campaigns, identify which depth, channel, and duration combinations have worked. Quantify lift where data allows.
Step 3. Cross-reference the diagnosis with what has worked. Discount depth, channel, and duration must match the problem.
Step 4. Generate three options. Each must specify: depth, channel, duration, segment, expected lift, expected yield impact, brand risk.
Step 5. Rank options by risk-adjusted lift, not gross lift.
Step 6. Identify the one option to avoid. Sometimes "no discount, fix the marketing" is the right answer.
Step 7. Self-check: every recommendation respects the constraints. No floor breach. No discount in never-discount windows.

Output:
1. Diagnosis (one paragraph)
2. Three options with: depth, channel, duration, segment, expected lift, yield impact, brand risk, recommended sequence
3. Risk-adjusted ranking
4. The option to avoid, with reason
5. Two leading indicators to watch in the first 7 days of execution
6. Decision questions for the client lead

Constraints:
- Respect every brand constraint and floor price
- Quantify lift only where past data supports it; otherwise tag [DIRECTIONAL]
- Do not recommend a depth deeper than the deepest historic campaign without flagging precedent risk`,
  },

  {
    title: 'Project Profitability Commentary',
    category: 'Finance',
    description: 'Understanding where a project lost margin — and why — is essential for pricing and scoping future work accurately. Give Claude the project P&L, hours by role, scope changes, and the original quote, and it breaks down the margin gap into three categories: scope creep that wasn\'t recovered commercially, original estimation errors, and execution overruns. Each finding is specific and quantified, and recommendations are tied directly to future pricing decisions.\n\nParticularly useful for project post-mortems and finance partner reviews.',
    type: 'prompt',
    variables: [
      { id: 'project_name', label: 'Project name' },
      { id: 'client_name', label: 'Client name' },
      { id: 'pnl', label: 'Project P&L (revenue, cost of delivery, gross margin)' },
      { id: 'hours_data', label: 'Hours by role (planned vs actual)' },
      { id: 'scope_changes', label: 'Scope changes during the project' },
      { id: 'non_billable', label: 'Non-billable hours absorbed' },
      { id: 'agency_average', label: 'Agency average for similar work type' },
      { id: 'original_quote', label: 'Original project quote and assumptions' },
    ],
    prompt: `You are a finance partner writing project profitability commentary for {{project_name}}, {{client_name}}.

Project P&L:
{{pnl}}

Hours by role (planned vs actual):
{{hours_data}}

Scope changes during the project:
{{scope_changes}}

Non-billable hours absorbed:
{{non_billable}}

Agency average for similar work:
{{agency_average}}

Original quote and assumptions:
{{original_quote}}

Method:

Step 1. Compare actual margin to quoted margin. State the gap in absolute and percentage terms.
Step 2. Decompose the gap: how much from scope (work added, recovered or not), how much from estimation error (we got the original budget wrong), how much from execution (we took longer than scoped on agreed work).
Step 3. By role, identify where hours overran most. Senior overruns and junior overruns mean different things.
Step 4. Compare to the agency average. Is this project an outlier or typical for the work type?
Step 5. Identify the scope changes that should have been recovered commercially but were not. Quantify the leakage.
Step 6. Lessons. Did we underestimate the brief? Did we underprice the senior time? Did we let scope drift without renegotiation?
Step 7. Recommendations for similar future projects: pricing, scoping, governance.
Step 8. Self-check: every claim tied to a number. No "we should have done better" without specifying what.

Output:
1. Margin headline: actual vs quoted, gap in £ and %
2. Decomposition: scope vs estimation vs execution
3. Hours overrun by role
4. Comparison to agency average (outlier or typical)
5. Recovered vs unrecovered scope additions, with leakage quantified
6. Three lessons for similar projects
7. Three pricing or scoping recommendations
8. Internal red flags for the leadership pack (only if the project warrants escalation)

Constraints:
- Quantify every claim
- Distinguish scope, estimation, execution failures
- Recommendations must be actionable on the next project, not abstract`,
  },

  {
    title: 'Revenue Recognition Memo Helper',
    category: 'Finance',
    description: 'Revenue recognition memos require careful judgement around when obligations are met and how income should be recognised — and getting it wrong has audit consequences. Give Claude the contract, obligations, delivery status, and applicable accounting standard and it drafts a structured memo obligation by obligation. Every judgement call is flagged clearly for Finance or Legal review; no final recognition decisions are made.\n\nDesigned to accelerate the drafting process while keeping all significant judgements with qualified reviewers.',
    type: 'prompt',
    variables: [
      { id: 'project_name', label: 'Project name' },
      { id: 'contract', label: 'Contract or SOW' },
      { id: 'obligations', label: 'Performance obligations within the contract' },
      { id: 'delivery_status', label: 'Delivery status against each obligation' },
      { id: 'payment_schedule', label: 'Payment schedule' },
      { id: 'amendments', label: 'Change orders or scope amendments' },
      { id: 'standard', label: 'Applicable accounting standard (e.g. IFRS 15, ASC 606)' },
      { id: 'prior_treatment', label: 'Prior treatment for similar engagements within the entity' },
    ],
    prompt: `You are drafting a revenue recognition memo for {{project_name}} for Finance and Legal review.

Contract or SOW:
{{contract}}

Performance obligations identified:
{{obligations}}

Delivery status against each obligation:
{{delivery_status}}

Payment schedule:
{{payment_schedule}}

Change orders or amendments:
{{amendments}}

Applicable accounting standard:
{{standard}}

Prior treatment for similar engagements:
{{prior_treatment}}

Method:

Step 1. List every distinct performance obligation in the contract. Quote the relevant clause text for each.
Step 2. Classify each obligation: point-in-time vs over-time. Cite the standard's tests applied.
Step 3. Map delivery status against each obligation. Is it complete, in progress, or not started?
Step 4. Calculate or describe the recognition position for each obligation as at the period date.
Step 5. Flag any obligation where the data is ambiguous or where legal interpretation is needed.
Step 6. Reconcile against the payment schedule. Where billing leads recognition, deferred revenue. Where recognition leads billing, accrued income.
Step 7. Compare to prior treatment for similar engagements. Note any departure and the reason.
Step 8. Self-check: every assertion tied to a contract clause or accounting test. No legal conclusions without explicit Legal sign-off pending.

Output:
1. Obligation register (clause reference, description, classification, recognition pattern)
2. Recognition position at period date
3. Deferred revenue or accrued income reconciliation
4. Departures from prior treatment, with reasoning
5. Items needing Finance judgement: [FINANCE REVIEW]
6. Items needing Legal interpretation: [LEGAL REVIEW]
7. Working assumptions made by the drafter

Constraints:
- This is a draft for human review. It is not a final memo.
- Quote contract clauses verbatim
- Tag every judgement with [FINANCE REVIEW] or [LEGAL REVIEW]
- Do not make the final recognition decision; surface options and the inputs needed`,
  },

  {
    title: 'Audience Identification Brief',
    category: 'Account Management',
    description: 'Knowing who to target is more than demographics — it\'s understanding the motivation that makes someone book this show over everything else competing for their attention. Give Claude the show details, comparator productions, and available buyer data and it identifies three distinct audiences: a primary group to concentrate spend on, a secondary group with high word-of-mouth value, and an exploratory audience worth testing with a smaller budget. Each comes with a buying motivation, channel map, and budget allocation.\n\nParticularly useful at the start of a campaign planning cycle when the team needs an audience strategy to brief from.',
    type: 'prompt',
    variables: [
      { id: 'show_name', label: 'Show or production name' },
      { id: 'opening_date', label: 'Opening date' },
      { id: 'genre_themes', label: 'Genre and themes' },
      { id: 'creative_team', label: 'Creative team and talent' },
      { id: 'venue_capacity', label: 'Venue and capacity' },
      { id: 'price_tiers', label: 'Ticket price tiers' },
      { id: 'comparator_data', label: 'Comparator productions and their audiences' },
      { id: 'first_party_data', label: 'First-party buyer data (anonymised)' },
      { id: 'market_data', label: 'Market data on genre audience' },
      { id: 'budget_channels', label: 'Marketing budget and expected channel mix' },
      { id: 'objectives', label: 'Client objectives (revenue, word of mouth, new audiences)' },
    ],
    prompt: `You are a strategist building the audience plan for {{show_name}}, opening {{opening_date}}.

Show details:
- Genre and themes: {{genre_themes}}
- Creative team and talent: {{creative_team}}
- Venue and capacity: {{venue_capacity}}
- Ticket price tiers: {{price_tiers}}

Comparator productions and their audiences:
{{comparator_data}}

First-party buyer data (anonymised):
{{first_party_data}}

Market data on genre audience:
{{market_data}}

Marketing budget and channel mix:
{{budget_channels}}

Client objectives:
{{objectives}}

Method:

Step 1. From the comparator data, identify the audience archetypes that historically buy this genre. Cluster into 3 to 5 archetypes.
Step 2. Layer the show specifics. Which archetypes does this production speak to most directly because of its themes, talent, or creative team?
Step 3. Pick a primary audience. They drive the bulk of revenue, are the easiest to reach, and the brand can credibly speak to them.
Step 4. Pick a secondary audience. Lower volume, but high enthusiasm or word-of-mouth value.
Step 5. Pick an exploratory audience. Smaller test budget, higher upside if it lands. Identify what would prove or disprove the bet within 4 weeks of opening.
Step 6. For each audience, write the buying motivation: what makes them book this show this month over the alternatives in their cultural diet?
Step 7. Map channels. Where does each audience actually spend attention?
Step 8. Self-check: no audience defined by demographics alone. Every audience has a motivation, a channel, and a budget allocation.

Output:
1. Primary, secondary, exploratory audiences
2. For each: archetype, buying motivation, indicative channels, budget allocation %
3. Show-specific hooks for each audience (what to say, what to show)
4. Three weak audiences to deprioritise, with reason
5. Test plan for the exploratory audience: signal, success metric, decision point
6. Decisions needed from the client

Constraints:
- No demographic-only audiences
- Tie every claim to comparator or market data
- Total budget allocation must equal 100%`,
  },

  {
    title: 'Key Period & Moments Calendar',
    category: 'Account Management',
    description: 'Not every week in a show\'s calendar is equal — some moments are genuinely worth a coordinated push across channels, and others aren\'t worth the spend. Give Claude the historical sales patterns, key dates, and competitive calendar and it identifies the 6 to 10 moments across the next 12 months worth activating hard — each with a clear hook, the right channel mix, a yield expectation, and the lead time needed to execute it properly.\n\nTurns a blank forward calendar into a prioritised activity plan.',
    type: 'prompt',
    variables: [
      { id: 'show_name', label: 'Show or brand name' },
      { id: 'venue', label: 'Venue' },
      { id: 'start_date', label: 'Start of forward window' },
      { id: 'end_date', label: 'End of forward window' },
      { id: 'historical_pattern', label: 'Historical sales pattern by week' },
      { id: 'external_moments', label: 'External calendar moments (holidays, awards, cultural events)' },
      { id: 'production_moments', label: 'Production-specific moments (cast changes, milestones, content drops)' },
      { id: 'competitor_calendar', label: 'Competitor opening calendar' },
      { id: 'client_tentpoles', label: 'Client\'s existing PR and marketing tentpoles' },
    ],
    prompt: `You are an account director building the 12-month moments calendar for {{show_name}} at {{venue}}.

Forward window: {{start_date}} to {{end_date}}

Show's historical sales pattern (by week):
{{historical_pattern}}

External calendar moments:
{{external_moments}}

Production-specific moments:
{{production_moments}}

Competitor opening calendar:
{{competitor_calendar}}

Client's existing PR and marketing tentpoles:
{{client_tentpoles}}

Method:

Step 1. Map the forward window. Plot historical sales softness and strength across the year.
Step 2. Layer external moments onto the calendar. Tag each as opportunity (we should ride this), neutral, or threat (this draws our audience elsewhere).
Step 3. Layer production-specific moments. Anniversaries, cast moments, and content drops are the highest-leverage hooks because they are owned and unique.
Step 4. Layer competitors. A competitor opening week is a threat; a quiet competitor calendar is an opportunity.
Step 5. From the combined calendar, identify 6 to 10 moments to push. Each must have a clear hook, not just a date.
Step 6. For each moment, recommend the channel mix appropriate to lead time and audience. A 4-week PR moment needs different channels than a 1-week paid push.
Step 7. Estimate yield expectation: high / medium / low, based on historical pattern and moment leverage.
Step 8. Identify three moments to deliberately not push. Quiet weeks fund loud ones.
Step 9. Flag conflicts with the client's existing tentpoles. Do not stack.

Output:
1. 12-month annotated calendar (months by row, moments overlaid)
2. Top 6-10 moments to push, each with: window, hook, channel mix, yield expectation, lead time required
3. Three moments to deliberately quiet
4. Conflicts with existing client tentpoles, with proposed resolution
5. Decisions and inputs needed from the client

Constraints:
- Every moment must have a hook beyond the date
- Tag yield as [DIRECTIONAL] where historical pattern is thin
- Respect existing client tentpoles; do not double-book`,
  },

  {
    title: 'Client Insight Presentation Builder',
    category: 'Account Management',
    description: 'Most insight presentations fail not because the data is wrong but because there\'s no clear point. Give Claude the research, data, and the question the client needs answered and it structures the presentation around one central takeaway — building the deck backwards from the insight, through the evidence and implication, to the recommended action. One clear narrative, not a collection of charts.\n\nUse it to turn a pile of research into a presentation the client can actually act on.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'period', label: 'Period under review' },
      { id: 'performance_data', label: 'Performance data for the period' },
      { id: 'insights_and_research', label: 'Insights or research to share' },
      { id: 'client_priorities', label: 'Client\'s current strategic priorities' },
      { id: 'desired_actions', label: 'Decisions or actions wanted from the meeting' },
      { id: 'room_audience', label: 'Audience and seniority in the room' },
      { id: 'time_available', label: 'Time available for the presentation' },
    ],
    prompt: `You are an account director building a client insight presentation for {{client_name}}.

Period under review: {{period}}

Performance data:
{{performance_data}}

Insights and research to share:
{{insights_and_research}}

Client's current strategic priorities:
{{client_priorities}}

Decisions or actions wanted from the meeting:
{{desired_actions}}

Audience and seniority in the room:
{{room_audience}}

Time available:
{{time_available}}

Method:

Step 1. Identify the single thing the client should remember a week after the meeting. If you cannot name it, the presentation is not yet built.
Step 2. Reverse-engineer the deck. The takeaway gets the closing slide. Everything before it earns it.
Step 3. From the data and research, choose the 3 to 5 facts that build to the takeaway. Discard the rest.
Step 4. For each fact, write: the insight (what it means), the evidence (the chart or number), the implication (what it changes for the client).
Step 5. Tie every implication to one of the client's strategic priorities. If a finding does not connect to a priority, it is interesting, not relevant.
Step 6. Land each section with a question, not a conclusion. Good meetings open conversations.
Step 7. Build the deck spine: opening (the takeaway as a question), the journey (3 to 5 facts each on one slide), the answer (the takeaway resolved), the ask.
Step 8. Self-check: does the time available actually fit the spine? Cut sections, not depth.

Output:
1. Single-sentence takeaway (the thing they should remember)
2. Deck spine: slide-by-slide title and one-line content
3. For each slide: insight, evidence (data or chart described), implication, the question to discuss
4. The ask: what action or decision do we want from the room?
5. Anticipated objections and responses
6. The slide to cut first if time runs out

Constraints:
- One takeaway, not three
- Every implication tied to a stated client priority
- Cut decoration. Every slide earns its place.`,
  },

  {
    title: 'Creative Format Identification Brief',
    category: 'Account Management',
    description: 'Kicking off a campaign production requires knowing which formats need new work and which can use existing assets — before a single brief is written. Give Claude the media plan and your available asset library and it maps each format to either a reuse, a recut, or a new production brief, sequences the schedule against lead times, and flags any gaps before they become a last-minute problem.\n\nTurns the media plan into a production schedule in one step.',
    type: 'prompt',
    variables: [
      { id: 'period', label: 'Media plan period' },
      { id: 'client_name', label: 'Client name' },
      { id: 'media_plan', label: 'Media plan (channels, formats, sizes, run dates)' },
      { id: 'audience_by_channel', label: 'Audience profile by channel' },
      { id: 'format_performance', label: 'Recent creative performance by format' },
      { id: 'existing_assets', label: 'Brand creative assets currently available' },
      { id: 'lead_times', label: 'Production lead times for each format type' },
      { id: 'production_budget', label: 'Budget for new asset production' },
    ],
    prompt: `You are an account manager identifying which creative formats are needed for the {{period}} media plan for {{client_name}}.

Media plan:
{{media_plan}}

Audience profile by channel:
{{audience_by_channel}}

Recent format performance:
{{format_performance}}

Existing brand creative library:
{{existing_assets}}

Production lead times:
{{lead_times}}

Budget for new asset production:
{{production_budget}}

Method:

Step 1. List every distinct format the media plan requires (size, ratio, runtime, file type). De-duplicate.
Step 2. For each format, check the existing asset library. Is there an asset that fits or can be re-cut? Tag REUSE, RECUT, or NEW.
Step 3. For NEW: estimate the production effort. Group similar new formats so they can be briefed in one production sprint.
Step 4. Cross-reference performance data. Which formats consistently outperform? Prioritise asset investment there.
Step 5. Match formats to moments. A premium 30-second hero asset for a tentpole; light variants for always-on.
Step 6. Identify gaps. Are there channels in the plan with no suitable existing asset and no NEW item briefed? Flag.
Step 7. Stage the production schedule against lead times so nothing misses go-live.
Step 8. Self-check: every plan line has an asset path (REUSE, RECUT, or NEW with brief) and meets its lead time.

Output:
1. Format-to-asset table: plan line, format, asset status (REUSE / RECUT / NEW), source, ready-by date
2. Production sprint plan: groupings of NEW assets to brief together
3. Performance-led prioritisation: which NEW assets justify higher production investment
4. Gaps where no asset path exists, flagged
5. Production schedule against media plan go-live
6. Recommended asset versions to retire (formats that consistently underperform)

Constraints:
- No plan line without an asset path
- Respect production lead times
- Flag any [GAP: ...] visibly`,
  },

  {
    title: 'Quarterly Client Review Prep Pack',
    category: 'Account Management',
    description: 'A quarterly review is your best opportunity to demonstrate strategic value and have the conversations that matter — but prep usually falls to the bottom of the to-do list. Give Claude the period\'s performance data, account history, and the asks you need to make and it prepares two things separately: an honest internal assessment of where the account actually stands, and a client-facing deck structure that leads with the highlights and surfaces the big asks clearly rather than burying them.\n\nEnsures the QBR is a strategic conversation, not a data report.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'meeting_date', label: 'QBR meeting date' },
      { id: 'performance_data', label: 'Quarter performance data (sales, marketing, organic, PR)' },
      { id: 'targets_budget', label: 'Targets and budget set at quarter start' },
      { id: 'activity_log', label: 'Activity log: what the agency delivered' },
      { id: 'profitability_hours', label: 'Hours and project profitability (internal only)' },
      { id: 'client_mood', label: 'Client mood signal (feedback, churn risk, satisfaction)' },
      { id: 'next_quarter_draft', label: 'Next quarter plan (draft)' },
      { id: 'outstanding_asks', label: 'Outstanding asks (from client and from agency)' },
    ],
    prompt: `You are an account director preparing for the QBR with {{client_name}} on {{meeting_date}}.

Quarter performance data:
{{performance_data}}

Targets and budget set at quarter start:
{{targets_budget}}

Activity log (what we delivered):
{{activity_log}}

Internal: project profitability and hours (not for client-facing material):
{{profitability_hours}}

Client mood signal:
{{client_mood}}

Next quarter plan (draft):
{{next_quarter_draft}}

Outstanding asks (both sides):
{{outstanding_asks}}

Method:

Step 1. Honest assessment first, internal only. Did we hit, miss, or exceed targets? Where did we add the most value? Where did we underdeliver? Where is the relationship strong or weak?
Step 2. From the honest assessment, build the client-facing narrative. The narrative should not lie, but it should know its purpose: maintain trust, set up next quarter, address concerns.
Step 3. Pick three highlights, three lessons, three priorities. Three of each, no more.
Step 4. For each lesson: own it, name what changes next quarter, do not over-apologise.
Step 5. For next quarter: surface the two or three biggest decisions or asks of the client. Do not bury them.
Step 6. Anticipate client questions. Difficult questions get rehearsed answers.
Step 7. Build the deck spine: where we said we would be, where we are, what we learned, what we are doing about it, what we need from you.
Step 8. Internal pre-read: what we hope to walk away with, what we will not concede, the back-up plan if the meeting goes badly.

Output:
1. Internal honest assessment (not for the client deck)
2. Client-facing deck spine, slide by slide
3. Three highlights, three lessons, three priorities
4. Two or three big asks of the client
5. Anticipated client questions with rehearsed responses
6. Internal pre-read: walk-away goals and concession boundaries
7. Risk note: anything in the data that could blow up in the meeting if we do not raise it first

Constraints:
- The honest internal assessment must not be confused with the client-facing narrative
- Three of each, not five
- Raise difficult issues before the client does`,
  },

  {
    title: 'Media Plan Review',
    category: 'Media Planning & Buying',
    description: 'A media plan should be able to justify itself against the brief it was built from — but reviewing it thoroughly before it goes to client takes time that isn\'t always there. Give Claude the brief and the plan and it stress-tests each channel against the objectives: flagging what\'s missing, what\'s excess relative to the goals, what looks mispriced against benchmarks, and what a well-designed test budget should cover.\n\nA useful second read before any plan goes to client sign-off.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'campaign', label: 'Campaign name' },
      { id: 'plan_full', label: 'Media plan (full, with line items, budgets, dates, targeting, formats)' },
      { id: 'objective', label: 'Campaign objective' },
      { id: 'audience', label: 'Target audience' },
      { id: 'brief', label: 'The brief that led to this plan' },
      { id: 'historical_performance', label: 'Recent performance data on similar plans for this brand' },
      { id: 'benchmarks', label: 'Industry benchmarks for channels used (CPMs, CPCs, viewability, reach)' },
      { id: 'constraints', label: 'Channel constraints or client preferences' },
      { id: 'budget', label: 'Total budget and any flex on it' },
    ],
    prompt: `You are a senior media strategist reviewing a media plan for {{client_name}}, {{campaign}}.

Media plan (full):
{{plan_full}}

Campaign objective:
{{objective}}

Target audience:
{{audience}}

Original brief:
{{brief}}

Recent similar-plan performance:
{{historical_performance}}

Industry benchmarks for channels used:
{{benchmarks}}

Channel constraints and client preferences:
{{constraints}}

Total budget and flex:
{{budget}}

Method:

Step 1. Read the plan once for shape: budget split by channel, flight pattern, asset requirements. No critique yet.
Step 2. Test against the brief. Does the plan answer the objective? Is the audience correctly addressed? If the answer to either is no, that is the headline.
Step 3. Channel-by-channel review. For each: is the budget proportionate to its expected contribution? Are formats and creative units suited to the funnel position? Is the targeting tight enough?
Step 4. Compare costs against benchmarks. Flag any line where CPM, CPC, or expected reach looks materially off.
Step 5. Examine the flight pattern. Is the plan front-loaded, evenly spread, or moment-led? Does that match the campaign objective?
Step 6. Identify what is missing. What channel, audience, or format is absent that the brief implies should be there?
Step 7. Identify what is excess. What line is there for politeness or habit, not contribution?
Step 8. Build a test agenda. A plan with no test budget is not a plan, it is a repeat of last quarter.
Step 9. Self-check: every critique either has a benchmark, a brief reference, or a stated assumption [INFERRED].

Output:
1. Headline: does this plan answer the brief? (yes / partially / no, with reason)
2. Channel-by-channel review (budget, format, targeting, flight)
3. Top 5 issues, ranked
4. What is missing (and what to add)
5. What is excess (and what to remove or shrink)
6. Recommended test budget and test design
7. Two questions for the planning team before signing off

Constraints:
- Critique against the brief, not against personal preference
- Tag inferences: [INFERRED]
- No critique without a constructive alternative`,
  },

  {
    title: 'Cross-Channel Reporting Commentary',
    category: 'Media Planning & Buying',
    description: 'Cross-channel reports that list each channel\'s numbers separately miss the point — the value is in the story that runs across all of them. Give Claude the paid, organic, PR, and earned performance data alongside business outcome figures and it writes a single narrative that explains what actually drove results, separates correlation from genuine contribution, and ends with what the evidence should change about next period\'s plan.\n\nTurns a channel-by-channel data pack into a strategic debrief.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'period', label: 'Reporting period' },
      { id: 'paid_data', label: 'Paid media performance for the period (by channel)' },
      { id: 'organic_data', label: 'Organic social performance for the period' },
      { id: 'pr_data', label: 'PR coverage and impact summary' },
      { id: 'earned_owned_data', label: 'Earned and owned content performance' },
      { id: 'outcome_data', label: 'Sales or business outcome data tied to the period' },
      { id: 'comparators', label: 'Comparator data (prior period, prior year, target)' },
      { id: 'story_arc', label: 'Story arc the report should tell (revenue, efficiency, brand health, audience growth)' },
    ],
    prompt: `You are a strategist writing the cross-channel performance commentary for {{client_name}}, {{period}}.

Paid media performance:
{{paid_data}}

Organic social performance:
{{organic_data}}

PR coverage and impact:
{{pr_data}}

Earned and owned content performance:
{{earned_owned_data}}

Sales or business outcome data:
{{outcome_data}}

Comparators:
{{comparators}}

Story arc the report should tell:
{{story_arc}}

Method:

Step 1. Read each channel's data in isolation. Note the top 2 movements per channel.
Step 2. Cross-reference movements against the sales or outcome data. Which channels demonstrably moved the business? Which moved metrics that did not translate?
Step 3. Find the through-line. The right report has one story, not five sub-reports glued together. The story arc input is your guide; if the data does not support it, say so.
Step 4. Distinguish correlation from contribution. Paid spend up + sales up is not proof; control for seasonality, distribution, PR.
Step 5. Surface the unintuitive: channels that punched above their budget, audiences that converted unexpectedly, content that worked for reasons we did not plan for.
Step 6. Build the recommendation set. What does this period's evidence change about next period's plan?
Step 7. Acknowledge what we still do not know. Open questions are not weakness; pretending you have answered them is.
Step 8. Self-check: the through-line is supported, not just asserted. Every recommendation tied to evidence.

Output:
1. Headline (3 sentences: through-line, key driver, key risk)
2. Channel-by-channel summary (one paragraph each)
3. The cross-channel through-line, with supporting evidence
4. Three things that worked unexpectedly
5. Three things that did not, with diagnosis
6. Recommendations for next period (max 5, each tied to evidence)
7. Open questions where data is thin
8. Caveats: what could change the picture (data gaps, attribution limits, seasonality)

Constraints:
- One story, not five
- Distinguish correlation from contribution
- Tag inferences: [INFERRED]
- Acknowledge attribution limits where they exist`,
  },

  {
    title: 'Shot List Creator',
    category: 'Creative & Production',
    description: 'Organises every required shot into a day schedule grouped by location and lighting — with per-shot cards, three priority shots tagged, and a 15% time buffer built in.',
    type: 'prompt',
    variables: [
      { id: 'brand', label: 'Brand name' },
      { id: 'shoot_date', label: 'Shoot date' },
      { id: 'content_brief', label: 'Content calendar or post brief driving the shoot' },
      { id: 'post_outputs', label: 'Post outputs needed and their formats (vertical video, square, story, carousel)' },
      { id: 'talent_wardrobe', label: 'Talent available and wardrobe / styling notes' },
      { id: 'location_details', label: 'Location details (where, when, indoor/outdoor, time-of-day preference)' },
      { id: 'brand_visuals', label: 'Brand visual guidelines (colour, framing, restricted poses or angles)' },
      { id: 'equipment', label: 'Equipment available' },
      { id: 'duration', label: 'Shoot duration (hours)' },
      { id: 'narrative_thread', label: 'Narrative or thematic thread linking the posts (if any)' },
    ],
    prompt: `You are a content producer building a shot list for the {{brand}} shoot on {{shoot_date}}.

Content calendar or post brief:
{{content_brief}}

Post outputs required:
{{post_outputs}}

Talent and wardrobe notes:
{{talent_wardrobe}}

Location:
{{location_details}}

Brand visual guidelines:
{{brand_visuals}}

Equipment:
{{equipment}}

Shoot duration:
{{duration}}

Narrative thread (if any):
{{narrative_thread}}

Method:

Step 1. List every distinct shot needed. Each post becomes one or more shots. Do not lose any.
Step 2. Tag each shot: format, framing, talent, props, lighting setup, expected duration in seconds (for video) or frame count (for stills).
Step 3. Group shots by location and lighting setup. Setup changes are the biggest time cost on a shoot day.
Step 4. Within groups, order by complexity ascending. Easy shots first to warm up, complex shots when the team is locked in.
Step 5. Build the day schedule against the duration. Include setup, breaks, and a 15% buffer.
Step 6. For each shot, write a short shot card: what we are getting, what good looks like, what the dealbreaker is.
Step 7. Identify the three shots we cannot leave without. Tag as PRIORITY. If the day overruns, the rest can be rescheduled.
Step 8. Self-check: every post in the brief is covered. No orphan posts. Schedule fits in duration with buffer.

Output:
1. Shot list table: shot ID, format, framing, talent, location, lighting, duration, priority
2. Day schedule grouped by setup
3. Per-shot cards: what we are getting, success criteria, dealbreaker
4. Three priority shots tagged
5. Backup plan if weather, talent, or equipment fails
6. Pre-shoot checklist for the producer

Constraints:
- Group by location and lighting to minimise resets
- Schedule must fit duration with 15% buffer
- Every required post output has at least one shot covering it`,
  },

  {
    title: 'Content Calendar Builder',
    category: 'Social Media',
    description: 'Matches content to brand moments and external anchors, distributes pillars across the window, and builds a week-by-week grid within production capacity.',
    type: 'prompt',
    variables: [
      { id: 'brand', label: 'Brand name' },
      { id: 'window', label: 'Calendar window (4 weeks, quarter, full year)' },
      { id: 'voice_pillars', label: 'Brand voice and content pillars' },
      { id: 'channels_cadence', label: 'Channels and posting cadence per channel' },
      { id: 'brand_moments', label: 'Major brand or client moments in window (launches, anniversaries, campaigns)' },
      { id: 'external_calendar', label: 'External calendar (cultural moments, awareness days, holidays, industry events)' },
      { id: 'production_capacity', label: 'Production capacity (original posts per week)' },
      { id: 'performance_benchmarks', label: 'Performance benchmarks (which post types and themes work best)' },
    ],
    prompt: `You are a social strategist building the content calendar for {{brand}} for {{window}}.

Brand voice and content pillars:
{{voice_pillars}}

Channels and cadence:
{{channels_cadence}}

Major brand moments in window:
{{brand_moments}}

External calendar:
{{external_calendar}}

Production capacity per week:
{{production_capacity}}

Performance benchmarks:
{{performance_benchmarks}}

Method:

Step 1. Plot the window week by week. Mark every brand moment and external moment. These are the anchors.
Step 2. For each anchor, decide if the brand should lead, ride, or skip. Lead means we own the moment; ride means we contribute; skip means it is not for us.
Step 3. Distribute content pillars across the window. No pillar should be silent for more than two weeks.
Step 4. Allocate post slots within production capacity. Reactive posts need slack in the schedule; do not fill 100% of capacity with planned content.
Step 5. For each slot, write a one-line post concept tied to a pillar or anchor.
Step 6. Match channel to concept. Carousel for educational, story for behind-the-scenes, reels for trend-led, etc.
Step 7. Apply performance benchmarks: where evidence shows a post type performs, lean into it. Where evidence shows it does not, justify or replace.
Step 8. Identify the three "must-hit" posts in the window: the ones where execution quality matters most.
Step 9. Self-check: production capacity not breached, every pillar represented, reactive slack preserved.

Output:
1. Week-by-week calendar grid (channel by week)
2. Per-slot brief: pillar, anchor (if any), concept, channel, format
3. Three must-hit posts, with why
4. Reactive slack allocation per week
5. Production sprint plan: what gets shot, written, designed when
6. Risk note: where the calendar is fragile (capacity, content gaps, dependencies)

Constraints:
- Stay within production capacity, with slack
- No pillar silent for more than two weeks
- Tag any post idea that needs rights or talent clearance`,
  },

  {
    title: 'Community FAQ Doc Compilation',
    category: 'Social Media',
    description: 'Clusters community questions by volume, drafts canonical responses in brand voice, flags sensitive topics for human handling, and marks each entry NEW, UPDATED, or RETIRED.',
    type: 'prompt',
    variables: [
      { id: 'brand', label: 'Brand name' },
      { id: 'community_data', label: 'Recent comments, DMs, and replies (anonymised, last 30–90 days)' },
      { id: 'existing_faq', label: 'Brand\'s existing FAQ document (if any)' },
      { id: 'voice_guidelines', label: 'Brand voice and reply guidelines' },
      { id: 'escalation_topics', label: 'Known sensitive or escalation topics' },
      { id: 'platforms', label: 'Platforms covered' },
    ],
    prompt: `You are a community manager compiling a refreshed FAQ document for {{brand}}.

Recent comments, DMs, and replies (anonymised):
{{community_data}}

Existing FAQ:
{{existing_faq}}

Brand voice and reply guidelines:
{{voice_guidelines}}

Sensitive or escalation topics:
{{escalation_topics}}

Platforms covered:
{{platforms}}

Method:

Step 1. Read the community data. Cluster questions by topic. Discard one-off, off-topic, or already-resolved threads.
Step 2. Count question volume per cluster. The 10 to 20 highest-volume topics earn FAQ entries.
Step 3. For each cluster, draft the canonical question in customer language, not brand language.
Step 4. Draft the response in brand voice. Length appropriate for the channel: shorter on stories, longer on email or DMs.
Step 5. Cross-check against escalation topics. Any cluster touching a sensitive topic gets a HUMAN flag with a holding response, not a stock answer.
Step 6. Compare against the existing FAQ. Mark each entry: NEW, UPDATED, REPLACED, or RETIRED.
Step 7. Identify gaps in the existing FAQ that the community data exposes.
Step 8. Self-check: no PII in any draft response. No commitments the brand cannot keep.

Output:
1. Refreshed FAQ document, ordered by volume
2. Per entry: customer-language question, draft response, status (NEW / UPDATED / REPLACED / RETIRED), platform variants if needed, HUMAN flag if escalation
3. Top 10 questions to retire from the existing FAQ
4. Gaps in the existing FAQ exposed by recent community data
5. Suggested response macros for the team's reply tool
6. Topics that should never have a stock answer (always human-handled)

Constraints:
- No PII in outputs
- No commitments the brand cannot keep (refunds, callbacks, named-staff replies)
- Escalation topics get HUMAN flag, not stock response`,
  },

  // ── V4 SUPPLEMENT ─────────────────────────────────────

  {
    title: 'Build a monthly content performance report',
    category: 'Account Management',
    tool: 'Claude',
    description: 'Turn raw Sprout Social and YouTube Studio exports into a slide-ready monthly performance report. Claude produces a metrics block aligned to your slide template, per-channel commentary, and three actionable insights — all from the data, no padding.\n\nNote: ensure all data is anonymised where required and do not include PII in comment quotes. Use only figures verbatim from your exports.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'month', label: 'Reporting month' },
    ],
    prompt: `You are a content strategist writing the {{month}} performance report for {{client_name}}.

Sprout Social export (post-level metrics: reach, impressions, engagements, saves, link clicks, follower change):
[PASTE SPROUT EXPORT]

YouTube Studio export (video-level: views, watch time, average view duration, retention, subscribers gained):
[PASTE YOUTUBE EXPORT]

Slide template structure (list the metric blocks the template expects):
[DESCRIBE TEMPLATE STRUCTURE]

Notable comments (anonymised, drawn from across channels):
[PASTE 3–5 ANONYMISED COMMENTS]

Comparator data (prior month, prior year, or campaign benchmark):
[PASTE COMPARATOR]

Client-specific KPIs that override the defaults:
[LIST ANY CUSTOM KPIs]

Method:
Step 1. Read both exports. Identify the top three movements vs comparator across all metrics. These set the headline.
Step 2. For the slide template: extract every metric the template asks for, in the format the template uses. Do not add metrics the template does not request.
Step 3. From the comments, pick three that say something true about the audience reaction: one positive, one critical, one surprising. Anonymise.
Step 4. Write the headline (3 sentences): top movement, what drove it, what to watch.
Step 5. Per-channel commentary (one short paragraph each). Lead with the metric that moved most, name the probable cause, do not pad.
Step 6. Insights section: three findings the client team should act on. Each tied to a number, each pointing at a decision.
Step 7. Self-check: every figure traceable to the export, no platitudes, no "engagement is up" without saying by how much.

Output:
1. Slide-ready metrics block (template-aligned, exact figures only)
2. Headline (3 sentences)
3. Per-channel commentary
4. Three insights with recommended actions
5. Three notable comments (anonymised)
6. Two questions the report raises that the team should investigate next month

Constraints:
- Verbatim figures from exports
- No invented benchmarks
- No PII in comment quotes`,
    video: null,
  },

  {
    title: 'Translate social copy for a new market',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Translate campaign social copy into a new language while preserving the hook, brand voice, and platform conventions — not just the words. Claude flags anything that does not travel culturally and provides an alternate version where the first translation feels stiff.\n\nNote: always have a native speaker review the final output before publishing. Do not include personal data or customer identifiers in the prompt.',
    type: 'prompt',
    variables: [
      { id: 'brand', label: 'Brand name' },
      { id: 'source_language', label: 'Source language' },
      { id: 'target_language', label: 'Target language' },
    ],
    prompt: `You are translating social copy for {{brand}} from {{source_language}} to {{target_language}}.

Source post copy (include all platform variants):
[PASTE SOURCE COPY]

Brand voice guide for target language (if available, otherwise describe tone):
[DESCRIBE TONE — e.g. warm and direct, playful, premium]

Platform of publication:
[e.g. Instagram, X, TikTok — translation conventions differ per platform]

Cultural or regulatory sensitivities for the target market:
[LIST ANY KNOWN SENSITIVITIES]

Locked phrases (brand names, claims, taglines that must not be translated):
[LIST LOCKED PHRASES]

Character or word limit for the target platform:
[SPECIFY IF APPLICABLE]

Method:
Step 1. Read the source. Identify the joke, hook, or emotional beat it relies on. Translation that loses the beat is failure.
Step 2. Translate for intent first, literal accuracy second. Idioms get cultural equivalents, not literal renderings.
Step 3. Preserve every locked phrase in its original form.
Step 4. Apply platform conventions — hashtags, mention syntax, and line breaks differ across platforms.
Step 5. Apply cultural sensitivities. Anything that lands awkwardly in the target market gets flagged or reworked.
Step 6. Compress to character limit if applicable. Cut connectives and modifiers before cutting meaning.
Step 7. Provide an alternate version if the first translation feels stiff. The team can pick.

Output:
1. Primary translation (within character limit)
2. Alternate translation (different register or angle)
3. Change log: what shifted from literal, and why
4. Risks: anything in the source that does not translate cleanly
5. Locked-phrase preservation check

Constraints:
- Locked phrases verbatim
- Within character limit
- Intent over literal
- Flag anything risky in target market: [LOCAL SENSITIVITY]`,
    video: null,
  },

  {
    title: 'Build a prospect research dossier',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Build the pitch dossier your new business team can actually use — facts, signals, and hooks, not a Wikipedia summary. Claude identifies strategic shifts, role profiles, the trigger for outreach, and three conversation openers grounded in what the prospect has said or done.\n\nNote: use only publicly available information. Do not input confidential data about prospects. Confirm a legitimate business basis exists before outreach.',
    type: 'prompt',
    variables: [
      { id: 'prospect_company', label: 'Prospect company' },
    ],
    prompt: `You are a new business researcher building the prospect dossier for {{prospect_company}}.

Roles to research (e.g. CMO, CEO, Head of Marketing):
[LIST KEY ROLES]

Service being approached for:
[DESCRIBE THE SERVICE OR CAPABILITY YOU ARE PITCHING]

Prior history (past pitches, conversations, mutual contacts):
[DESCRIBE ANY PRIOR CONTACT OR LEAVE BLANK]

Time horizon for the outreach (urgent, opportunistic, long-game):
[SPECIFY]

[If web search is enabled] Search recent sources, prefer original sources, cite each claim.

[If pasting sources] Source material:
[PASTE PUBLIC SOURCE MATERIAL]

Method:
Step 1. Build the company snapshot: what they make, where they operate, scale, ownership, recent direction. Six lines, no decoration.
Step 2. Identify the strategic shifts in the last 18 months. Acquisitions, leadership changes, new markets, product pivots, public commitments. Each shift is a potential trigger.
Step 3. For each role, write a one-paragraph profile: tenure, prior roles, public statements relevant to our service, what they appear to care about.
Step 4. Identify the trigger. The reason the agency should approach now, not three months ago or three months from now. If there is no trigger, the timing is wrong.
Step 5. List three hooks the agency could use to open conversation. Each hook is something the prospect has said, done, or shown they care about.
Step 6. Map adjacent intelligence: their agencies of record, their content, their tools, their recent campaigns. Where might we slot in?
Step 7. Identify risk: known agency conflicts, controversies, or relationship landmines.
Step 8. Self-check: every claim has a source citation. Soft inference tagged [INFERRED].

Output:
1. Company snapshot (six lines)
2. Strategic shifts in last 18 months (with sources)
3. Role profiles (one per requested role)
4. The trigger (why now)
5. Three hooks for opening conversation
6. Adjacent intelligence (current agencies, content, tools, campaigns)
7. Risks and conflicts
8. Open questions to research before the first meeting

Constraints:
- Cite every claim
- Tag inferences: [INFERRED]
- No filler`,
    video: null,
  },

  {
    title: 'Build a weekly client status deck',
    category: 'Account Management',
    tool: 'Claude',
    description: 'Convert your project status notes into a structured weekly status deck — one that leads with what changed, not what is happening. Claude surfaces decisions, flags risks that have moved, and closes with the one ask of the meeting.\n\nNote: do not include commercially sensitive data or named individual salaries. Keep the output practical, not promotional.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'meeting_date', label: 'Meeting date' },
    ],
    prompt: `You are an account manager building the weekly status deck for {{client_name}} for {{meeting_date}}.

Active projects with status (on track / at risk / blocked / complete):
[LIST PROJECTS AND STATUS]

Last week's commitments and outcomes:
[WHAT WAS COMMITTED LAST WEEK AND WHAT HAPPENED]

This week's commitments and dependencies:
[WHAT IS COMMITTED THIS WEEK AND WHAT IS NEEDED FROM WHOM]

Pending decisions the client owes the team:
[LIST WITH DEADLINE IMPACT]

Pending decisions the team owes the client:
[LIST WITH TARGET DATES]

Risks or escalations to surface:
[LIST ONLY RISKS THAT HAVE MOVED THIS WEEK]

Team changes affecting the account this week:
[LIST IF RELEVANT TO CLIENT]

Method:
Step 1. Lead with what changed since last week. Status quo is not news; deltas are.
Step 2. For projects ON TRACK: one line each. Save deck space for what needs attention.
Step 3. For AT RISK or BLOCKED: name the issue, the impact on dates, the proposed unblock, the decision needed.
Step 4. Surface decisions both ways. Burying client decisions in the deck is the most common reason status meetings drift.
Step 5. Risks: only those that have moved (new risks, escalating risks, resolved risks). Old risks the client has heard before do not earn slide time.
Step 6. Close with the one decision the team most wants from the client this week.

Output:
1. Cover with the meeting headline (the one thing that changed)
2. Projects on track summary (one line each)
3. At risk and blocked projects with proposed unblocks
4. Decisions client owes us (with deadline impact)
5. Decisions we owe client (with target dates)
6. Risk register update (only what moved)
7. The one ask of the meeting

Constraints:
- Lead with deltas, not status quo
- Decisions surfaced, not buried
- No celebratory language for ON TRACK status`,
    video: null,
  },

  {
    title: 'Analyse brand content trends and plan next month',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Answer "what should this brand make next month?" using their recent content performance, current cultural trends, and competitor content. Claude distinguishes trends from fads, identifies uncrowded territory, and recommends three concrete content concepts with rationale.\n\nNote: use only publicly available information about competitors. Do not include personal data about audiences.',
    type: 'prompt',
    variables: [
      { id: 'brand', label: 'Brand name' },
    ],
    prompt: `You are a content strategist analysing trends for {{brand}} to inform the next month's content plan.

Brand and category context:
[DESCRIBE THE BRAND AND THE CATEGORY IT OPERATES IN]

Recent brand content (formats, themes, performance — summarise what has been published):
[DESCRIBE OR PASTE RECENT CONTENT PERFORMANCE]

Cultural moments and trends being tracked:
[LIST TRENDS OR CULTURAL MOMENTS RELEVANT TO THIS BRAND]

Competitor and category content for the same period:
[DESCRIBE WHAT COMPETITORS HAVE BEEN PUBLISHING]

Content question being asked (e.g. what to make next, how to refresh tone, what to retire):
[STATE THE SPECIFIC QUESTION]

[If web search is enabled] Search recent sources, prefer original sources, cite each claim.

[If pasting sources] Source material:
[PASTE SOURCE MATERIAL]

Method:
Step 1. Read the brand's recent content. Identify which themes have over- and under-performed.
Step 2. Map current trends. For each, judge: is this a fit for the brand's voice and audience? A trend the brand cannot credibly play in is a distraction.
Step 3. Cross-reference against competitor content. Where are competitors playing? Where are they absent?
Step 4. Find the unowned territory. The trend that fits the brand and is uncrowded by competitors is the highest-leverage move.
Step 5. Distinguish trend (durable, multi-source) from fad (single source, short cycle). The content plan should ride trends and reference fads, not the other way around.
Step 6. Answer the question directly. If the question is "what should we make next month", give three concrete content concepts with rationale.
Step 7. Identify what to retire. Themes that have stopped earning attention.

Output:
1. Direct answer to the question
2. Three content concepts with rationale, format, and recommended channel
3. Trends to ride (with confidence level and time horizon)
4. Fads to reference but not invest in
5. Themes to retire
6. Unowned territory the brand could claim

Constraints:
- Cite every claim
- Tag fads vs trends
- Concepts must be actionable in the next 30 days`,
    video: null,
  },

  {
    title: 'Create a full influencer briefing pack',
    category: 'Social Media',
    tool: 'Claude',
    description: 'Go beyond the creative brief. Claude builds the complete operational pack the influencer needs to deliver without back-and-forth: compliance disclosure language, usage rights, approval workflow, payment terms, and a do/don\'t list specific to this brand.\n\nNote: this is a complement to the personalised creative brief use case. Requires client sign-off before sharing. Ensure disclosure language is exact and unambiguous — consult Legal if in doubt.',
    type: 'prompt',
    variables: [
      { id: 'influencer_name', label: 'Influencer name' },
      { id: 'campaign_name', label: 'Campaign name' },
      { id: 'brand', label: 'Brand name' },
    ],
    prompt: `You are creating the briefing pack for {{influencer_name}} on the {{campaign_name}} campaign for {{brand}}.

Campaign brief (objective, audience, dates, deliverables, hashtags):
[DESCRIBE THE CAMPAIGN]

Influencer profile and content style:
[DESCRIBE THE INFLUENCER'S CHANNEL AND CONTENT STYLE]

Brand guidelines extract (voice, dos, don'ts, mandatories):
[PASTE RELEVANT BRAND GUIDELINES]

Compliance requirements (advertising disclosure rules, regulatory requirements for this category):
[SPECIFY DISCLOSURE LANGUAGE AND PLACEMENT REQUIREMENTS]

Approval workflow (who approves drafts, in what tool, by when):
[DESCRIBE APPROVAL PROCESS AND SLAs]

Usage rights granted (paid, organic, repurpose, term):
[SPECIFY EXACTLY WHAT RIGHTS ARE GRANTED]

Payment terms and schedule:
[DESCRIBE PAYMENT TERMS]

Deliverables specification (format, length, hashtags, links):
[LIST ALL REQUIRED DELIVERABLES]

Method:
Step 1. Lead with what the influencer needs to know in 30 seconds: brand, campaign, what to post, by when, for how much.
Step 2. The creative brief: respect their voice. Do not ask them to sound like the brand; ask them to talk about the brand the way they talk about everything.
Step 3. Mandatories: list explicitly. What must be said, what must be shown, what must not be said, what links go where.
Step 4. Compliance: the disclosure language they must use, exactly. Where it goes in the post. Why.
Step 5. Approval: who approves, in what tool, the SLA, what happens if they miss the slot.
Step 6. Usage rights: what we can do with the content beyond their feed. Be explicit; ambiguity creates disputes later.
Step 7. Payment: terms, schedule, who to invoice, how to invoice.
Step 8. Build a do/don't list specific to this brand.

Output:
1. Quick brief (30-second read: brand, campaign, output, deadline, fee)
2. Creative direction (in their language, respecting their voice)
3. Mandatories with rationale
4. Compliance disclosure (exact language and placement)
5. Approval workflow with SLA
6. Usage rights summary
7. Payment terms and invoice details
8. Do/don't list specific to this brand
9. Contact for questions with response-time expectation

Constraints:
- Respect the influencer's voice
- Compliance language must be exact and unambiguous
- No over-stipulation that kills spontaneity
- Audit-trail ready (this pack is the brief if a regulator asks)`,
    video: null,
  },

  {
    title: 'Write a new business outreach sequence',
    category: 'New Business & Strategy',
    tool: 'Claude',
    description: 'Build a multi-touch outreach sequence where every email earns its place. Claude opens with prospect-specific intelligence, varies the angle across touches, and closes with a soft ask — not a template-spam cadence.\n\nNote: confirm you have a legitimate interest basis before sending any outreach sequence. Do not input personal data beyond what is necessary. Comply with GDPR and applicable email marketing regulations. Legal review recommended.',
    type: 'prompt',
    variables: [
      { id: 'agency_name', label: 'Agency name' },
      { id: 'prospect_segment', label: 'Prospect segment' },
    ],
    prompt: `You are drafting a new business outreach sequence for {{agency_name}} targeting {{prospect_segment}}.

Number of touches in the sequence:
[e.g. 3 or 4]

Ideal prospect profile (sector, size, role, signals):
[DESCRIBE THE TARGET PROSPECT]

Qualified prospects with intelligence (for each: recent news, role, company size, signal that triggered outreach):
[LIST PROSPECTS WITH PUBLIC INTEL — do not include personal data beyond public role information]

Agency positioning and proposition for this audience:
[DESCRIBE YOUR POSITIONING]

Relevant case study or proof point:
[DESCRIBE THE PROOF POINT]

Desired meeting outcome (intro call, proposal review, event invitation):
[SPECIFY]

Sender voice sample (tone, sentence length, formality):
[DESCRIBE THE SENDER'S VOICE OR PASTE A WRITING SAMPLE]

Existing cadence (number of touches, gaps between):
[DESCRIBE YOUR CURRENT CADENCE OR LEAVE BLANK]

Method:
Step 1. Read the prospect intel. The opening line of touch 1 must reference something the prospect did, said, or is dealing with. Generic openers are deleted on sight.
Step 2. Touch 1 earns the reply by making a point, not asking for time. Lead with the insight — the reason you are writing this prospect specifically.
Step 3. Touch 2, sent 4–7 days later, adds a different angle. Same prospect, different proof point or reframe. Not a "just bumping this up" message.
Step 4. Touch 3 is the soft close. Acknowledge the prospect may not be the right person and ask for a redirect, not a meeting.
Step 5. Optional touch 4 is the breakup: respect their inbox, leave the door open, name the trigger that would bring you back.
Step 6. Across the sequence, vary length. Touch 1 longer, touch 2 medium, touch 3 short.
Step 7. Match the sender voice across all touches. Read each draft aloud. If it sounds like a template, redraft.

Output:
1. Per-prospect customisation field map
2. Touch 1 draft (subject line + body)
3. Touch 2 draft (subject line + body)
4. Touch 3 draft (subject line + body)
5. Touch 4 breakup if applicable
6. Cadence schedule (when to send each)
7. Reply guide: how to respond to common replies (interested, not now, wrong person, unsubscribe)

Constraints:
- Touch 1 must reference prospect-specific intel
- No "just checking in" or "circling back" lines
- Respect unsubscribe requests immediately`,
    video: null,
  },

  {
    title: 'Create a client onboarding pack',
    category: 'Account Management',
    tool: 'Claude',
    description: 'Build the onboarding pack a new client can read once and refer back to — practical and specific, not a sales document. Claude structures team contacts, communication protocols, approval workflows, and 30/60/90-day milestones from your SOW and kick-off notes.\n\nNote: do not include confidential commercial terms beyond what is agreed in the SOW. Ensure client approval before circulating the pack.',
    type: 'prompt',
    variables: [
      { id: 'client_name', label: 'Client name' },
      { id: 'start_date', label: 'Kick-off date' },
    ],
    prompt: `You are an account director preparing the onboarding pack for {{client_name}}, kicking off {{start_date}}.

Signed SOW or agreed contract terms (scope, deliverables, fees):
[PASTE RELEVANT SCOPE SUMMARY — do not include confidential pricing unless already shared with client]

Account team structure (names, roles, remits, contact details):
[LIST TEAM MEMBERS]

Communication protocols (channels, response times, escalation path):
[DESCRIBE HOW THE TEAM COMMUNICATES WITH THE CLIENT]

Project management tool and access setup:
[DESCRIBE THE PM TOOL AND HOW THE CLIENT ACCESSES IT]

Approval workflow and decision rights:
[DESCRIBE WHO APPROVES WHAT AND THE SLA]

Reporting cadence and template:
[DESCRIBE WHEN AND HOW REPORTS ARE DELIVERED]

30/60/90-day milestones:
[DESCRIBE WHAT GOOD LOOKS LIKE AT EACH GATE]

Anything specific the client requested at kick-off:
[LIST ANY SPECIFIC CLIENT REQUESTS]

Method:
Step 1. Lead with the team page. The client should know who does what within 30 seconds.
Step 2. Communication protocols: be specific. "Response within 24 hours on email" is useful; "we'll be in touch" is not.
Step 3. Approval workflow: name the decision, the decider on each side, the SLA. Where decisions stack, draw the routing.
Step 4. PM tool setup: access steps, what gets logged where, what the client can see.
Step 5. Reporting cadence: when, what format, what level of detail. Reference the template.
Step 6. 30/60/90: define what "good" looks like at each gate. The client should know what to expect.
Step 7. Specific requests from kick-off: address each one explicitly. Demonstrating you listened is half the onboarding.
Step 8. Mutual obligations: what we need from them, what they need from us. Surface upfront.

Output:
1. Team page (named contacts, role, remit, contact info)
2. Communication protocols (channels, response times, escalation path)
3. Approval and decision-rights map
4. PM tool access guide
5. Reporting cadence with template reference
6. 30/60/90-day milestones
7. Specific responses to client kick-off requests
8. Mutual obligations: what we need from each other
9. FAQ: anticipated client questions

Constraints:
- Practical, not promotional
- Specific times and names
- Address every client kick-off request explicitly`,
    video: null,
  },

  {
    title: 'Draft a targeted email blast',
    category: 'Social Media',
    tool: 'Claude',
    description: 'One objective per email. Claude drafts five subject line candidates, a preheader, body copy, CTA, plain-text variant, and pre-flight checklist — built around what the audience needs to do and why today.\n\nNote: ensure your audience has opted in and you have a legal basis for contacting them. Do not include customer personal data in the prompt. Confirm client approval before sending. Comply with email marketing regulations.',
    type: 'prompt',
    variables: [
      { id: 'brand', label: 'Brand name' },
      { id: 'audience_segment', label: 'Audience segment' },
    ],
    prompt: `You are drafting an email blast for {{brand}} to {{audience_segment}}.

Audience segment profile (size, opt-in basis, what they care about):
[DESCRIBE THE AUDIENCE]

Single objective of this email (sell tickets, drive page traffic, announce news):
[STATE THE ONE OBJECTIVE]

Hook (the reason this email exists today, not next week):
[DESCRIBE THE HOOK — urgency, news, offer, event]

Brand voice guide:
[DESCRIBE THE TONE — or paste a voice guide extract]

Mandatories (legal, brand, accessibility requirements):
[LIST MANDATORIES]

Past email performance benchmarks (open rates, click rates, top-performing subject lines):
[PASTE IF AVAILABLE]

CTAs (primary + secondary if needed):
[DESCRIBE THE CALLS TO ACTION]

Send-time and device-mix expectations:
[e.g. Thursday morning, 70% mobile]

Method:
Step 1. Define the success metric. An email written for opens looks different from one written for clicks.
Step 2. Subject line: 5 candidates. Vary angle (curiosity, urgency, benefit, surprise, name-drop). Match brand voice.
Step 3. Preheader: extends or contrasts the subject. Does not repeat it.
Step 4. First line: earn the read. Cut "Hello, hope you are well." Lead with the hook.
Step 5. Body: under 100 words for promotional, longer only if the email earns it. One idea, one CTA.
Step 6. CTA button: action verb, not "Click here". Mobile-friendly.
Step 7. Mandatories: place where they belong (legal in footer, accessibility in alt text). Do not let them dilute the body.
Step 8. Three send-time considerations: device mix, time-zone, audience routine.

Output:
1. Five subject line candidates (with the angle each takes)
2. Preheader
3. Body draft
4. CTA button text and any secondary action
5. Plain-text variant for accessibility
6. Mandatories placement check
7. Pre-flight checks (links, images, alt text, unsubscribe)
8. Two A/B variants worth testing if volume supports it

Constraints:
- One objective, one CTA
- Subject lines under 50 characters where possible
- No "we hope you are well"
- All mandatories present`,
    video: null,
  },

  // ── CUSTOM BUILDS ─────────────────────────────────────────────────────────

  {
    title: 'Company Intel Platform',
    category: 'Legal & Finance',
    tool: 'Custom Build',
    description: 'Automates due diligence and corporate monitoring across any UK company. Add a business to your watchlist and the platform continuously monitors Companies House for director changes, overdue accounts, and financial stress signals — automatically extracting key metrics like turnover, net assets, and cash position from filed accounts. A 0–100 risk score combines governance, financial health, liquidity, and reputational data, with real-time email alerts on critical RED flags.',
    type: 'custom-build',
    status: 'dev',
    agencies: ['Group-wide', 'Finance', 'Legal'],
    demoUrl: null,
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Company Intel Platform',
  },

  {
    title: 'Adobe Clipping Solution',
    category: 'Creative & Production',
    tool: 'Custom Build',
    description: 'Automates the entire social clipping workflow inside Adobe Premiere Pro. Teams upload a spreadsheet with in/out timecodes and the script handles the rest: auto-clipping, AI-powered speaker reframing, subtitle transcription, and batch export of social-ready 9:16 videos — eliminating hours of repetitive manual work per week. Reach out to the AI team for instructions on how to install the extension.',
    type: 'custom-build',
    status: 'live',
    agencies: ['Multiple', 'Buzz16'],
    demoUrl: 'https://www.loom.com/share/027243d6b26843ba864698baabb7a845',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Adobe Clipping Solution',
  },

  {
    title: 'Maker Lab Interview Automation',
    category: 'HR & People',
    tool: 'Custom Build',
    description: 'Automates Maker Lab\'s recruitment pipeline end to end. Google Meet interview transcripts are picked up automatically, analysed by AI against the job description, and structured candidate profiles — skills, salary, notice period, availability — are generated and synced directly into Workable ATS. Recruiters review and share profiles with one click. Clients get clean, consistent candidate summaries.',
    type: 'custom-build',
    status: 'live',
    agencies: ['Maker Lab'],
    demoUrl: 'https://www.loom.com/share/f2112396308b4f8ca6839a684d8645ec',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Maker Lab Interview Automation',
  },

  {
    title: 'Meta Campaign Automation',
    category: 'Media Planning & Buying',
    tool: 'Custom Build',
    description: 'Removes the manual effort from Meta paid media campaign setup. The Sold Out digital team upload a CSV file, the platform builds the full campaign architecture automatically, and it\'s ready to activate. Now embedded in the Sold Out workflow and the first step in a broader media automation programme, with plans to extend to other platforms and agencies across the group.',
    type: 'custom-build',
    status: 'live',
    agencies: ['Sold Out'],
    demoUrl: 'https://www.loom.com/share/2e21c14a70614136974b3ed04095e13c',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Meta Campaign Automation',
  },

  {
    title: 'PR Daily Coverage',
    category: 'PR & Communications',
    tool: 'Custom Build',
    description: 'Two PR coverage platforms purpose-built for StoryHouse\'s theatre clients and Multiple\'s film clients. The system monitors news sources and publications daily, automatically surfacing reviews, features, and mentions relevant to each show or film in the portfolio. It then assembles a formatted daily coverage report — giving PR teams a complete picture of what\'s been written without manually trawling dozens of outlets each morning.',
    type: 'custom-build',
    status: 'live',
    agencies: ['StoryHouse', 'Multiple'],
    demoUrl: null,
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — PR Daily Coverage',
  },

  {
    title: 'Data Parsing & Tag Request Automation',
    category: 'Media Planning & Buying',
    tool: 'Custom Build',
    description: 'Streamlines Spot Co\'s tag request workflow by automating the data flow from insertion order to media plan to tag request sheet — eliminating the double-keying of data and freeing the team to focus on higher-value work. Enables faster campaign setup and delivery while reducing human error throughout the process.',
    type: 'custom-build',
    status: 'live',
    agencies: ['Spot Co'],
    demoUrl: 'https://www.loom.com/share/128328f59d05464581cf1d7ca609c8dd',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Data Parsing %26 Tag Request Automation',
  },

  {
    title: 'Contract Management System',
    category: 'Legal & Finance',
    tool: 'Custom Build',
    description: 'An AI-powered contract review and approval platform handling the entire lifecycle from upload to e-signature. Upload any NDA, client contract, or supplier agreement and the platform produces an executive summary, extracts key commercial terms, flags red clauses against Miroma\'s own policy, and risk-scores the contract. It then flows through a structured multi-stage approval process — Submitter → Finance → Agency → Legal — before being sent automatically for e-signature via DocuSign, with role-based access, email notifications, and a full audit trail throughout.',
    type: 'custom-build',
    status: 'dev',
    agencies: ['Group-wide', 'Legal'],
    demoUrl: 'https://www.loom.com/share/8a09b9651d0341779ec37aa1608f501a',
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Contract Management System',
  },

  {
    title: 'Media Platform',
    category: 'Media Planning & Buying',
    tool: 'Custom Build',
    description: 'A centralised platform to transform how media services are delivered across Miroma Group — from brief intake through to reporting. Each agency gets their own view of the platform, streamlining everything from client brief and AI media planning, through campaign activation and ad trafficking, to real-time performance dashboards and group finance integration. Designed to move the group from fragmented, Excel-based workflows to a scalable, intelligent media ecosystem.',
    type: 'custom-build',
    status: 'scoping',
    agencies: ['MX UK', 'MX US', 'Attentive', 'Spot Co', 'Dewynters', 'MFN', 'Sold Out'],
    demoUrl: null,
    requestUrl: 'mailto:aiteam@miroma.com?subject=Request Access — Media Platform',
  },

];

/* =============================================
   MIROMA AI HUB — What's New feed
   =============================================
   HOW TO ADD AN ITEM
   ──────────────────
   1. Copy any existing entry below.
   2. Paste it at the TOP of the NEWS array (newest first).
   3. Fill in the fields — only 'date', 'type', 'title', and 'body' are required.
   4. Save the file. The feed updates automatically.

   FIELD REFERENCE
   ───────────────
   date   : "YYYY-MM-DD"
   type   : "tip" | "update" | "video"
   tool   : "Claude" | "LTX Studio" | "Descript" | "Springboards" | "Fireflies"
            (leave out if not tool-specific)
   title  : Short headline
   body   : 1–3 sentences of detail
   link   : { label: "Read more →", url: "https://..." }   — optional external link
   video  : For YouTube → { thumb: "https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg",
                             url:   "https://www.youtube.com/watch?v=VIDEO_ID" }
            For Loom    → { embed: "https://www.loom.com/embed/LOOM_ID" }
   ============================================= */

const NEWS = [

  {
    date: '2026-05-12',
    type: 'update',
    title: 'Miroma Group AI Summit — July 2026',
    body: 'The Miroma Group AI Summit is our flagship internal event for 2026 — a full-day gathering designed to showcase progress, align leadership, and accelerate AI adoption across the group.\n\nTeams from across Miroma will come together to demonstrate real work, share learnings, and define the next phase of AI-driven transformation. We\'re still shaping the agenda and want it to reflect what matters most to the group.\n\nIf there\'s a topic you\'d like to see covered, a question you think the group should be wrestling with, or an expert speaker you\'d love to hear from — let us know. This is your summit as much as ours.',
    links: [
      { label: 'Share a topic or speaker suggestion →', url: 'mailto:aiteam@miroma.com?subject=AI%20Summit%20suggestion' },
      { label: 'Share a win →', url: 'https://miroma-ai-hub.web.app/share-a-win.html' },
    ],
  },

  {
    date: '2026-05-05',
    type: 'update',
    tool: 'Claude',
    title: 'Claude is rolling out across Miroma Group',
    body: 'We\'re moving to Claude as our primary AI platform, replacing Writer. The model quality is a step up from what we had, and the tooling — Projects, agentic workflows, and integrations — is built for the kind of work we do day-to-day: brief generation, transcript review, campaign analysis, and client comms. Each seat has a weekly usage allowance that resets automatically; most users will be on a standard seat, and if you\'re a heavier user there\'s a premium seat option available for those who need more. Rollout begins the week of 11th May — your agency lead will confirm your access, and Tess and Tom will be on hand to support onboarding across the group. In the meantime, get a head start with the dedicated Claude learning pathway on the AI Hub.',
    link: { label: 'Get started with the learning pathway →', url: 'https://miroma-ai-hub.web.app/learning.html' },
  },

  {
    date: '2026-04-29',
    type: 'update',
    tool: 'Claude',
    title: 'Meta Ads MCP Connector — now available in Claude',
    body: 'Meta has released an official MCP connector for Meta Ads, which we can set up as a Custom Connector inside Claude. It gives Claude direct access to your ad accounts — so you can pull reports, manage campaigns, handle your product catalogue, and diagnose signal health, all through natural language conversation. No switching tabs, no manual exports. The four capabilities now available are: Comprehensive Reporting (surface insights and pull detailed performance reports), Campaign Management (create and edit ads, ad sets, and campaigns using natural language), Catalog Management (create a product catalogue, add product data, and troubleshoot data feed issues), and Signal Diagnostics (access signal health and quality information to prioritise your signals setup).',
    link: { label: 'Read the Meta announcement →', url: 'https://www.facebook.com/business/news/meta-ads-ai-connectors' },
  },

  {
    date: '2026-04-17',
    type: 'update',
    tool: 'Claude',
    title: 'Claude Design is now available',
    body: 'Claude Design is a new tool from Anthropic Labs that lets you collaborate with Claude to create visual outputs — designs, prototypes, one-pagers, and slides — directly inside Claude. It\'s available now and works alongside your existing Claude chats.',
    link: { label: 'Get started with Claude Design →', url: 'https://support.claude.com/en/articles/14604416-get-started-with-claude-design' },
  },

  {
    date: '2026-04-15',
    type: 'update',
    tool: 'LTX Studio',
    title: 'ChatGPT Images 2.0 is now in LTX Studio',
    body: 'LTX Studio has integrated ChatGPT Images 2.0, bringing significantly improved image generation quality into the platform. Higher detail, better prompt adherence, and more realistic outputs — available directly inside your LTX Studio projects.',
    link: { label: 'Read the update →', url: 'https://ltx.studio/blog/chatgpt-images-2-0' },
  },

];

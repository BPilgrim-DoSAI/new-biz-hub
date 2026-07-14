/* eslint-disable */
/**
 * Claude Onboarding Pathway — main React component.
 * Renders inside #cp-root within the #tab-claude panel on learning.html.
 */

// ---- Video component with inline player ----
function CPVideo({ id, label, title, duration }) {
  const [playing, setPlaying] = React.useState(false);

  const handlePlay = () => {
    setPlaying(true);
    try {
      const key = 'miroma_hub_watched';
      const watched = JSON.parse(localStorage.getItem(key) || '[]');
      if (!watched.includes(id)) {
        watched.push(id);
        localStorage.setItem(key, JSON.stringify(watched));
      }
    } catch {}
  };

  if (playing) {
    return (
      <div className="dirA-video dirA-video--playing">
        <div className="dirA-video__embed">
          <iframe
            src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="dirA-video__info">
          <p className="dirA-video__label">{label}</p>
          <p className="dirA-video__title">{title}</p>
          <p className="dirA-video__duration">{duration} · YouTube</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dirA-video" role="button" tabIndex={0} onClick={handlePlay}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handlePlay()}>
      <div className="dirA-video__thumb">
        <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt={title} loading="lazy" />
        <div className="dirA-video__play">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      </div>
      <div className="dirA-video__info">
        <p className="dirA-video__label">{label}</p>
        <p className="dirA-video__title">{title}</p>
        <p className="dirA-video__duration">{duration} · YouTube</p>
      </div>
    </div>
  );
}

// ---- Step component ----
function CPStep({ n, head, body }) {
  return (
    <li className="dirA-step">
      <span className="dirA-step__num">{n}</span>
      <div className="dirA-step__body">
        <strong>{head}</strong>
        <p>{body}</p>
      </div>
    </li>
  );
}

// ---- Stage component ----
function CPStage({ n, stageId, title, sub, time, done, onComplete, isActive, badge, children }) {
  const [collapsed, setCollapsed] = React.useState(true);

  React.useEffect(() => {
    if (done) setCollapsed(true);
  }, [done]);

  React.useEffect(() => {
    if (isActive) setCollapsed(false);
  }, [isActive]);

  if (collapsed) {
    return (
      <section className="dirA-stage dirA-stage--collapsed">
        <button className="dirA-stage-collapsed-btn" onClick={() => setCollapsed(false)}>
          <span className="dirA-stage-collapsed-l">
            <span className="dirA-stage-collapsed-num">{n}</span>
            <span className={`dirA-stage-collapsed-check${done ? '' : ' dirA-stage-collapsed-check--empty'}`}>{done ? '✓' : ''}</span>
            <span className="dirA-stage-collapsed-text">
              <span className="dirA-stage-collapsed-title">
                {title}
                {badge && <span className="dirA-stage-badge">{badge}</span>}
              </span>
              <span className="dirA-stage-collapsed-sub">{sub}</span>
            </span>
          </span>
          <span className="dirA-stage-collapsed-r">
            <span className="dirA-stage-collapsed-meta">{done ? `Complete · ${time}` : time}</span>
            <span className="dirA-stage-collapsed-reopen">{done ? 'Reopen ↓' : 'Open ↓'}</span>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="dirA-stage">
      <aside className="dirA-stage__rail">
        <p className={`dirA-stage__num${done ? ' dirA-stage__num--done' : ''}`}>{n}</p>
        <h2 className="dirA-stage__title">{title}</h2>
        {badge && <p className="dirA-stage-badge dirA-stage-badge--rail">{badge}</p>}
        <p className="dirA-stage__sub">{sub}</p>
        <p className="dirA-stage__time">{time}{done ? ' · DONE' : ''}</p>
        <button className="dirA-stage-collapse-btn" onClick={() => setCollapsed(true)}>
          Minimise ↑
        </button>
      </aside>
      <div className="dirA-stage__body">
        {children}
        <button
          className={`dirA-complete${done ? ' dirA-complete--done' : ''}`}
          onClick={() => !done && onComplete()}
          disabled={done}
        >
          {done ? '✓ Stage complete' : 'Mark stage complete →'}
        </button>
      </div>
    </section>
  );
}

// ---- Persistence helpers ----
// M-3: scope by Firebase Auth uid rather than email. Old email-keyed
// entries are orphaned; Firestore (pathway_progress) is authoritative.
function cpStorageKey() {
  const uid = (typeof hubGetUid === 'function') ? hubGetUid() : '';
  return 'miroma_hub_pathway_' + (uid || 'guest');
}
function cpLoadCompleted() {
  try {
    const p = JSON.parse(localStorage.getItem(cpStorageKey())) || {};
    const set = new Set();
    ['stage1','stage2','stage3','stage4','stage5','stage6','stage7'].forEach((id, i) => {
      if (p[id]) set.add(i + 1);
    });
    return set;
  } catch { return new Set(); }
}
function cpSaveStage(n) {
  try {
    const p = JSON.parse(localStorage.getItem(cpStorageKey())) || {};
    p['stage' + n] = true;
    localStorage.setItem(cpStorageKey(), JSON.stringify(p));
  } catch {}
}

// ---- Which Claude quiz ----
const WC_TOOLS = [
  {
    id: 'claude-ai',
    scenario: 'Write, research, analyse or create something',
    name: 'Claude.ai',
    type: 'AI Assistant',
    desc: 'General tasks, research, writing, analysis and file creation. The version you\'ll use most.',
    where: 'Web, desktop and mobile apps',
    url: 'https://claude.ai',
  },
  {
    id: 'cowork',
    scenario: 'Complete a complex, multi-step task',
    name: 'Claude Cowork',
    type: 'Agentic Tasks',
    desc: 'Research briefs, document creation, file organisation and data analysis. Claude works through multi-step tasks on your behalf.',
    where: 'Claude desktop app',
    url: 'https://claude.com/download',
  },
  {
    id: 'code',
    scenario: 'Write, review or debug code',
    name: 'Claude Code',
    type: 'Software Development',
    desc: 'Software development, codebase navigation and git workflows. Runs directly in your terminal or IDE.',
    where: 'Terminal / command line / IDE',
    url: 'https://claude.ai/code',
  },
  {
    id: 'slack',
    scenario: 'Get help while working in Slack',
    name: 'Claude in Slack',
    type: 'Team Collaboration',
    desc: 'Team collaboration, meeting prep and quick answers in context — without leaving your workspace.',
    where: 'Slack workspace',
    url: 'https://claude.ai/integrations',
  },
  {
    id: 'excel',
    scenario: 'Analyse or model data in a spreadsheet',
    name: 'Claude for Excel',
    type: 'Data & Finance',
    desc: 'Spreadsheet analysis, financial modelling and formula debugging — available as a sidebar inside Excel.',
    where: 'Microsoft Excel sidebar',
    url: 'https://claude.ai/integrations',
  },
  {
    id: 'powerpoint',
    scenario: 'Build or improve a presentation',
    name: 'Claude for PowerPoint',
    type: 'Presentations',
    desc: 'Slide creation, presentation editing, formatting and design — directly inside PowerPoint.',
    where: 'Microsoft PowerPoint sidebar',
    url: 'https://claude.ai/integrations',
  },
  {
    id: 'chrome',
    scenario: 'Research online or manage emails in Chrome',
    name: 'Claude for Chrome',
    type: 'Browser',
    desc: 'Web research, email management and browser automation — available as a Chrome extension.',
    where: 'Chrome browser extension',
    url: 'https://claude.ai/integrations',
  },
];

function WhichClaude() {
  const [selected, setSelected] = React.useState(null);
  const result = WC_TOOLS.find(t => t.id === selected);

  return (
    <div className="wc-quiz">
      <div className="wc-quiz__header">
        <p className="dirA-hero-eyebrow">Quick Reference · Claude</p>
        <h2 className="wc-quiz__title">Which Claude should you use?</h2>
        <p className="wc-quiz__sub">Claude works across multiple environments. Pick your task and we'll point you to the right one.</p>
      </div>

      {!result ? (
        <div className="wc-quiz__options">
          {WC_TOOLS.map(t => (
            <button key={t.id} className="wc-quiz__option" onClick={() => setSelected(t.id)}>
              <span className="wc-quiz__option-text">{t.scenario}</span>
              <span className="wc-quiz__option-arrow">→</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="wc-quiz__result">
          <div className="wc-quiz__result-left">
            <p className="wc-quiz__result-label">Recommended</p>
            <h3 className="wc-quiz__result-name">{result.name}</h3>
            <p className="wc-quiz__result-type">{result.type}</p>
            <p className="wc-quiz__result-desc">{result.desc}</p>
            <p className="wc-quiz__result-where">
              <span className="wc-quiz__result-where-label">Where it runs</span>
              {result.where}
            </p>
          </div>
          <div className="wc-quiz__result-right">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="dirA-cta">Get started →</a>
            <button className="wc-quiz__reset" onClick={() => setSelected(null)}>← Try another</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main component ----
function ClaudePathway() {
  const [role, setRole] = React.useState('all');
  const [slots, setSlots] = React.useState({});
  const [completed, setCompleted] = React.useState(() => cpLoadCompleted());
  const [openStage, setOpenStage] = React.useState(null);

  const setSlot = React.useCallback((name, value) => {
    setSlots(s => ({ ...s, [name]: value }));
  }, []);

  const syncToFirestore = React.useCallback((stagesSet) => {
    if (typeof fsSyncPathwayProgress !== 'function') return;
    // M-3: email comes from Firebase Auth, not localStorage.
    const email = (typeof hubGetEmail === 'function') ? hubGetEmail() : '';
    if (email) fsSyncPathwayProgress(email, stagesSet).catch(() => {});
  }, []);

  const completeStage = (n) => {
    cpSaveStage(n);
    const next = new Set([...completed, n]);
    setCompleted(next);
    syncToFirestore(next);
    if (n < 7) setOpenStage(n + 1);
  };

  const resetProgress = () => {
    if (!window.confirm('Reset all progress? Your completed stages will be cleared.')) return;
    try { localStorage.removeItem(cpStorageKey()); } catch {}
    setCompleted(new Set());
    setOpenStage(1);
  };

  // Re-read progress when auth changes and sync any existing progress to Firestore
  React.useEffect(() => {
    const refresh = (e) => {
      const fresh = cpLoadCompleted();
      setCompleted(fresh);
      if (e && e.type === 'mirAuthReady' && fresh.size > 0) {
        syncToFirestore(fresh);
      }
    };
    document.addEventListener('mirAuthReady', refresh);
    document.addEventListener('mirAuthSignedOut', refresh);
    return () => {
      document.removeEventListener('mirAuthReady', refresh);
      document.removeEventListener('mirAuthSignedOut', refresh);
    };
  }, [syncToFirestore]);

  const sb = (key) => (
    <PromptSandbox
      promptKey={key}
      role={role}
      slotValues={slots}
      onSlotChange={setSlot}
    />
  );

  return (
    <div className="dirA">

      {/* Hero */}
      <header className="dirA-hero">
        <div>
          <p className="dirA-hero-eyebrow">Module · Claude · 7 Stages · ~90 min</p>
          <h1 className="dirA-hero-title">Your guided path <em>to Claude.</em></h1>
        </div>
        <div className="dirA-hero-meta">
          <p className="dirA-hero-blurb">
            This is a guided, hands-on pathway, custom built by the Miroma Group AI team for your specific workflows. By the end of this training, you won't just know how to use Claude — you'll have your profile set up, a new project built, a repetitive task automated, and real work shipped.
          </p>
          <p style={{ fontSize: 11, color: 'var(--c-stone)', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {completed.size}/7 stages complete · Pick your role to personalise →
          </p>
        </div>
      </header>

      {/* Sticky role picker */}
      <div className="dirA-role">
        <div className="dirA-role__lhs">
          <span className="role-picker__label">I work in</span>
          <div className="role-picker">
            {CP_ROLES.map(r => (
              <button
                key={r.id}
                className={`role-chip${role === r.id ? ' is-active' : ''}`}
                onClick={() => setRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="dirA-role__progress">
          <span><strong>{completed.size}</strong> of 7 stages</span>
          {completed.size > 0 && (
            <button className="pathway-reset-btn" onClick={resetProgress}>
              Reset progress
            </button>
          )}
        </div>
      </div>

      {/* How-to instructions */}
      <div className="dirA-howto">
        <div className="dirA-howto__item">
          <div className="dirA-howto__marker dirA-howto__marker--role"></div>
          <div className="dirA-howto__text">
            <strong>Pick your role above</strong>
            Every prompt on this page adapts to your function — account, strategy, creative, and more. Switch roles at any time to see the version most relevant to you.
          </div>
        </div>
        <div className="dirA-howto__item">
          <div className="dirA-howto__marker dirA-howto__marker--slot"></div>
          <div className="dirA-howto__text">
            <strong>Edit the yellow fields</strong>
            Yellow highlighted text is a fill-in-the-blank slot. Type once and it updates everywhere — so every prompt is ready to copy straight into Claude.
          </div>
        </div>
      </div>

      {/* Stages */}
      <div className="dirA-stages">

        {/* STAGE 1 — The basics */}
        <CPStage n="01" stageId="stage1" title="The basics" sub="Get up and running in your first session." time="~18 min" done={completed.has(1)} onComplete={() => completeStage(1)} isActive={openStage === 1}>
          <CPVideo id="0vZ_UVLhSQQ" label="Claude — Foundations" title="Getting started with Claude.ai" duration="5:19" />

          <div>
            <p className="dirA-section-h">Claude Usage Rules</p>
            <p className="dirA-prose">These rules apply to everyone with access to Claude through the Miroma Group account. They exist to protect confidential information, client data, personal data, the Group's reputation, and its regulatory obligations under UK GDPR and our client contracts.</p>
            <p className="dirA-prose">Claude is a tool to support human work, not replace human judgement. Every output must be reviewed by a person before it is acted upon or shared.</p>
            <details className="dirA-rules">
              <summary className="dirA-rules__summary">Read the full Claude Usage Rules</summary>
              <div className="dirA-rules__body">

                <p className="dirA-rules__intro">If you are in doubt about whether something is permitted, ask the AI team or Legal before you act.</p>

                <p className="dirA-rules__group">Access &amp; Identity</p>
                <div className="dirA-rule"><p className="dirA-rule__head">1. Use your work email and SSO</p><p className="dirA-rule__body">Log in with your company email through single sign-on. Do not use any personal Claude accounts connected to your work address.</p><p className="dirA-rule__why"><strong>Why:</strong> This is how access is controlled, audited, and removed when someone leaves. It also keeps Group's contractual protections in place. Personal accounts sit under different terms.</p></div>

                <p className="dirA-rules__group">Data &amp; Privacy</p>
                <div className="dirA-rule"><p className="dirA-rule__head">2. Incidental B2B contact data is permitted; bulk personal data is not</p><p className="dirA-rule__body">Minimal, incidental business contact data — such as a client's name and email in a draft email, or signatory details in a contract — is permitted where the context is clearly professional and the data is not the focus of processing. Do not upload contact lists, CRM exports, spreadsheets of client contacts, or any bulk personal data under this exception.</p><p className="dirA-rule__why"><strong>Why:</strong> Incidental use in a professional context is low-risk. Bulk or systematic processing of personal data is not — it requires contractual and regulatory controls that are not in place for Claude.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">3. No HR, recruitment, or special category data</p><p className="dirA-rule__body">Do not upload anything covered by special category data under UK GDPR. This includes health, biometric, racial or ethnic origin, religion, politics, trade union membership, or sexual orientation. HR and recruitment material is also prohibited: CVs, applications, performance reviews, salary records, disciplinary notes, and absence data.</p><p className="dirA-rule__why"><strong>Why:</strong> Special category data is not covered by Anthropic's Data Processing Addendum. Uploading it is a regulatory breach, not just a policy one.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">4. No personal identifiers in client's customer data</p><p className="dirA-rule__body">Anonymise before upload. Strip names, email addresses, phone numbers, postal addresses, account numbers, IP addresses, and any other identifier that links data to a real person. Aggregated and anonymised data is permitted unless a client contract specifically restricts or limits use of AI tools — if you are unsure whether a restriction applies, check with Legal before proceeding. Pseudonymised data, where identifiers have been replaced or removed but users could still be re-identified, remains personal data and is subject to UK GDPR.</p><p className="dirA-rule__why"><strong>Why:</strong> Under our client contracts we are a data processor and Claude would be a sub-processor. Contracts require explicit client approval before personal data goes to a third-party AI tool.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">5. No social media comments with names, handles or identifiers attached</p><p className="dirA-rule__body">If you are using Claude to draft responses to social posts, remove the name, handle and timestamp columns first, as well as any tagged users in the post. Work from the post content, then map responses back manually. Before processing this data in Claude, review your Data Processing Agreement with the relevant client. If this use falls outside its scope, ensure the relevant approval process in the client agreement is followed before proceeding. Note the restrictions in rule 4 apply in full here, including in relation to pseudonymised data.</p><p className="dirA-rule__why"><strong>Why:</strong> A publicly visible name or handle does not mean it is fair game. The data subject belongs to the client, not to us. Inputting identifiable or pseudonymised data without contractual approval breaches our data processor agreement with clients — see rule 4 for sub-processor obligations that apply.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">6. Finance and expense data</p><p className="dirA-rule__body">Expense claims, invoices, and finance data with incidental personal information attached can be processed where necessary for legitimate business purposes.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">7. Specific use cases requiring personal data must go through a DPIA first</p><p className="dirA-rule__body">If you have a use case that requires inputting personal data not otherwise permitted by these rules, you must complete a Data Protection Impact Assessment (DPIA) and obtain sign-off from Legal and the AI team before proceeding.</p><p className="dirA-rule__why"><strong>Why:</strong> A DPIA ensures risks are identified and mitigated before processing begins, not after. Early flagging protects the business and the individuals whose data is involved.</p></div>

                <p className="dirA-rules__group">Integrations &amp; Connectors</p>
                <div className="dirA-rule"><p className="dirA-rule__head">8. MCP connectors require central approval</p><p className="dirA-rule__body">Default position: no MCP connectors. To request one, contact the AI team and your IT provider. Requests are assessed case-by-case based on use case, data scope, and risk. Any approved connector must be scoped to a specific folder or workspace — not a full account.</p><p className="dirA-rule__why"><strong>Why:</strong> MCP connectors give Claude live access to other systems. Without scope controls they can pull personal data, confidential client information, or HR records into a session without anyone realising. They also consume tokens at 15–80× the rate of a normal upload.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">9. No MCP connection to email systems</p><p className="dirA-rule__body">Gmail, Outlook, and any other inbox integration is blocked.</p><p className="dirA-rule__why"><strong>Why:</strong> Email contains personal data, client confidential information, and HR matters in unpredictable combinations. There is no scope control granular enough to make this safe.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">10. Cowork currently not permitted</p><p className="dirA-rule__body">While we work out the data concerns around Cowork, particularly providing it with folder access, we ask that for now this is not used. It is currently disabled in your agency instance.</p><p className="dirA-rule__why"><strong>Why:</strong> Cowork gives Claude access to files on your local machine. Without scope controls it can read, summarise, or surface anything in its reach, including data the user has forgotten is there. Restricting Cowork while we assess provides protection against data leaks.</p></div>

                <p className="dirA-rules__group">Usage &amp; Cost</p>
                <div className="dirA-rule"><p className="dirA-rule__head">11. Default to Sonnet; escalate to Opus only when needed</p><p className="dirA-rule__body">Sonnet handles most work. Use Opus only for deep analysis, strategy, or complex reasoning. Use Haiku for simple classification and batch tasks.</p><p className="dirA-rule__why"><strong>Why:</strong> Opus costs 5× Sonnet per token. Defaulting to Opus is the single fastest way to burn through your agency's allocation.</p></div>

                <p className="dirA-rules__group">Quality, Review &amp; Professional Standards</p>
                <div className="dirA-rule"><p className="dirA-rule__head">12. Keep prompts and outputs reviewable</p><p className="dirA-rule__body">Save prompts used to create client deliverables. Review every output for accuracy, tone, bias, and IP risk before it leaves the agency. Do not send Claude outputs to clients as-is without human review and adaptation. AI-generated content must be owned by a person before it goes out under the agency's name.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">13. Claude does not replace professional or functional review</p><p className="dirA-rule__body">Claude can help you prepare, draft, or summarise material to support specialist review — but the specialist function (Legal, Finance, Compliance, HR) must do the substantive review itself. Do not use Claude to perform a review that should be done by Legal, Finance, or another function, and then present the output as if that review has taken place.</p><p className="dirA-rule__why"><strong>Why:</strong> Claude can make plausible-sounding errors in specialist domains. A contract reviewed only by Claude has not been legally reviewed — Claude does not carry professional liability and can miss issues a qualified lawyer would catch. Professional sign-off is a control and required for our insurance purposes.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">14. Claude must not be used to assess, rate, or make decisions about individuals</p><p className="dirA-rule__body">Do not use Claude to evaluate someone's performance, recommend a salary or pay decision, assess conduct or disciplinary matters, or reach any conclusion about an individual that would normally involve HR or a line manager. This applies even where no personal data has been uploaded — the judgement itself must come from a person, not an AI tool.</p><p className="dirA-rule__why"><strong>Why:</strong> Claude has no knowledge of the individual, their context, or the organisation's standards. A Claude-assisted assessment is not a fair or defensible one. These decisions carry legal and human consequences that require human accountability.</p></div>

                <p className="dirA-rules__group">Retention &amp; Transparency</p>
                <div className="dirA-rule"><p className="dirA-rule__head">15. Delete individual chats when no longer needed</p><p className="dirA-rule__body">Delete conversation histories once the work they relate to is complete and any outputs have been saved elsewhere. Where a conversation has involved any personal data — including incidental contact data permitted under rule 2 — delete it once the work is complete. Do not retain chats containing personal or confidential information beyond the immediate working session.</p><p className="dirA-rule__why"><strong>Why:</strong> Retaining unnecessary conversations increases the risk of inadvertent data exposure and complicates compliance with data minimisation obligations under UK GDPR.</p></div>
                <div className="dirA-rule"><p className="dirA-rule__head">16. Consider whether to disclose AI use to clients</p><p className="dirA-rule__body">Some clients will want to know if AI tools were involved in producing their work. Where there is any doubt, check with your account lead before delivering AI-assisted work externally. Do not represent AI-generated content as entirely human-authored where that would be misleading.</p><p className="dirA-rule__why"><strong>Why:</strong> Transparency builds trust. Misrepresentation, even inadvertently, creates reputational and contractual risk.</p></div>

                <p className="dirA-rules__group">Reporting</p>
                <div className="dirA-rule"><p className="dirA-rule__head">17. Flag concerns, breaches, or unusual behaviour immediately</p><p className="dirA-rule__body">If something looks wrong, an output seems off, or you suspect data has gone where it shouldn't — tell the AI team immediately. If personal data or confidential information is involved, also tell Legal.</p><p className="dirA-rule__why"><strong>Why:</strong> Early flagging contains issues. Late flagging escalates them.</p></div>

                <p className="dirA-rules__footer">Breach of these rules may result in disciplinary action under the standard Group disciplinary procedure. If in doubt, ask the AI team or Legal before you act.</p>
              </div>
            </details>
          </div>

          <div>
            <p className="dirA-section-h">Set up</p>
            <ol className="dirA-steps">
              <CPStep n="1" head="Log in to Claude" body={<>Visit <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">claude.ai</a> and sign in with your work email.</>} />
              <CPStep n="2" head="Make Claude work for you from day one" body={<>Run the prompt below, answer the questions, paste the result into <strong>Settings → General → Personal Preferences</strong>.</>} />
            </ol>
          </div>

          {sb('s1_profile')}

          <div>
            <p className="dirA-section-h">Try your first Artifact</p>
            <p className="dirA-prose">Artifacts allow you to turn ideas into shareable apps, tools, or content — build tools, visualizations, and experiences by simply describing what you need. Claude can share substantial, standalone content with you in a dedicated window separate from the main conversation. This makes it easy to work with significant pieces of content that you may want to modify, build upon, or reference later.</p>
            <p className="dirA-prose dirA-muted">Drop this into a new chat. Claude will build something interactive in the side panel — that's an Artifact.</p>
          </div>

          {sb('s1_first_artifact')}

        </CPStage>

        {/* STAGE 2 — Projects */}
        <CPStage n="02" stageId="stage2" title="Projects" sub="Keep Claude in context across every conversation." time="~18 min" done={completed.has(2)} onComplete={() => completeStage(2)} isActive={openStage === 2}>
          <CPVideo id="GJ5jTgcbRHA" label="Claude — Projects" title="Getting started with Projects" duration="7:07" />

          <div>
            <p className="dirA-section-h">What are Projects?</p>
            <p className="dirA-prose">Projects allow you to create self-contained workspaces with their own chat histories and knowledge bases. Within each project, you can upload documents, provide context, and have focused chats with Claude. Regular chats are for one-off tasks. Projects keep your context — brand guidelines, briefs, team tone — across every conversation, so Claude understands your work without re-explaining it each time.</p>
          </div>

          <div>
            <p className="dirA-section-h">Build a Project</p>
            <ol className="dirA-steps">
              <CPStep n="1" head="Create" body={<>In Claude, click <strong>Projects</strong> → <strong>New project</strong>. Name it <em>[Client] — [Quarter]</em>.</>} />
              <CPStep n="2" head="Add instructions" body="Paste the role-aware system prompt below. Fill in your client and brand descriptor in the yellow fields — they sync across every prompt on the page." />
              <CPStep n="3" head="Upload context" body="Drop in the brief, brand guidelines, the latest contact report, and any relevant past work. Two files beats none — start with what you have." />
              <CPStep n="4" head="Test the lift" body="Ask the project the test prompt below. Compare it with the same question asked outside the Project — the difference is the value." />
            </ol>
          </div>

          {sb('s2_project_instructions')}
          {sb('s2_test_prompt')}
        </CPStage>

        {/* STAGE 3 — Prompt like a pro */}
        <CPStage n="03" stageId="stage3" title="Prompt like a pro" sub="Five techniques. Sharper outputs." time="~15 min" done={completed.has(3)} onComplete={() => completeStage(3)} isActive={openStage === 3}>
          <p className="dirA-prose dirA-muted">Most people use 20% of what a prompt can do. These five techniques close that gap — each one takes 30 seconds to apply and produces a noticeably better output. Try each in a live chat as you go.</p>

          {sb('s4_role')}
          {sb('s4_examples')}
          {sb('s4_format')}
          {sb('s4_think')}
          {sb('s4_refine')}

          <div className="dirA-tip">
            <strong>Pull it together.</strong> Try the combined prompt below on a real brief sitting on your desk right now.
          </div>
          {sb('s4_combined')}
        </CPStage>

        {/* STAGE 4 — Build & automate */}
        <CPStage n="04" stageId="stage4" title="Build & automate" sub="Turn what you do every week into a reusable Skill." time="~12 min" done={completed.has(4)} onComplete={() => completeStage(4)} isActive={openStage === 4}>
          <CPVideo id="kS1MJFZWMq4" label="Claude — Skills" title="Creating custom Skills" duration="0:48" />

          <p className="dirA-prose">Skills encode your repeatable workflows. Once a Skill is set up, Claude applies it automatically whenever a relevant task comes up — like training a new team member on the jobs you do on repeat.</p>

          {sb('s5_skill')}

          <div className="dirA-tip">
            <strong>Closing exercise.</strong> Run this on yourself. It turns the pathway into a one-week plan you can actually act on.
          </div>
          {sb('s5_finale')}
        </CPStage>

        {/* STAGE 5 — Claude Code */}
        <CPStage n="05" stageId="stage5" title="Claude Code" sub="For developers — write, review and debug code with AI, wherever you work." time="~8 min" done={completed.has(5)} onComplete={() => completeStage(5)} isActive={openStage === 5}>
          <CPVideo id="fl1DSmwQKKY" label="Claude — Claude Code" title="What is Claude Code?" duration="2:56" />

          <p className="dirA-prose">Claude Code brings AI directly into your development workflow. It's available in three ways: in your terminal or IDE as a command-line tool, in the Claude desktop app, and on the web at claude.ai. However you access it, Claude Code can read your codebase, files, and git history — describe what you want and it reads, writes, and debugs code on your behalf.</p>

          <div>
            <p className="dirA-section-h">Get started</p>
            <ol className="dirA-steps">
              <CPStep n="1" head="Access Claude Code" body={<>You can access Claude Code three ways: visit <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">claude.ai</a> and open a new Code session, download the Claude desktop app from <a href="https://claude.com/download" target="_blank" rel="noopener noreferrer">claude.com/download</a>, or install the CLI with <code style={{fontFamily:'monospace', background:'#f3f3f3', padding:'1px 5px', borderRadius:3}}>npm install -g @anthropic-ai/claude-code</code> for full terminal and IDE integration.</>} />
              <CPStep n="2" head="Open a project" body={<>In the terminal, navigate to a project directory and run <code style={{fontFamily:'monospace', background:'#f3f3f3', padding:'1px 5px', borderRadius:3}}>claude</code> to start a session. In the desktop app or on the web, point Claude Code at a folder to give it access to your project. Either way, it reads your codebase before responding.</>} />
              <CPStep n="3" head="Describe what you need" body="Claude Code can read your entire codebase, suggest changes, write tests, fix bugs, and run git commands — all from natural language. Start with a specific task rather than an open-ended question." />
            </ol>
          </div>
        </CPStage>

        {/* Pending Legal approval banner */}
        <div className="dirA-pending-banner">
          <p className="dirA-pending-banner__eyebrow">Pending Legal approval</p>
          <h3 className="dirA-pending-banner__title">The stages below are not yet approved for use on Miroma work.</h3>
          <p className="dirA-pending-banner__body">
            The functionality covered in stages 06 and 07 has not yet been approved by Legal. Do not use these features on client or Miroma work until approval is granted. The training material is provided for awareness only. To check current status or request approval for a specific use case, contact the <a href="mailto:aiteam@miroma.com">AI team</a>.
          </p>
        </div>

        {/* STAGE 6 — Connectors (pending approval) */}
        <CPStage n="06" stageId="stage6" title="Connectors" sub="Give Claude live access to the tools you already use." time="~8 min" done={completed.has(6)} onComplete={() => completeStage(6)} isActive={openStage === 6} badge="Individual connectors require approval">
          <CPVideo id="_jjSS0qGFbI" label="Claude — Connectors" title="Getting started with Connectors" duration="3:44" />

          <div>
            <p className="dirA-section-h">What are connectors?</p>
            <p className="dirA-prose">Connectors let Claude access your apps and services, retrieve your data, and take actions within connected services. Claude inherits each person's permissions from the connected service. If someone can't access a specific file, channel, or record in the source system, the connector can't reach it from Claude either.</p>
          </div>

          <p className="dirA-section-h" style={{marginTop: 20}}>Approved connectors</p>
          <div className="dirA-connectors">
            {[
              ['monday', 'Monday.com'],
              ['adobe', 'Adobe'],
              ['adverity', 'Adverity'],
              ['asana', 'Asana'],
              ['canva', 'Canva'],
              ['figma', 'Figma'],
              ['funnel', 'Funnel'],
              ['meta-ads', 'Meta ads'],
              ['miro', 'Miro'],
            ].map(([slug, label]) => (
              <a key={slug} href="https://claude.ai/settings/integrations" target="_blank" rel="noopener noreferrer" className="dirA-connector">
                <img src={`assets/logos/connectors/${slug}.png`} alt="" width="16" height="16" onError={(e) => { e.target.style.display='none'; }} />
                {label}
              </a>
            ))}
          </div>

          <div>
            <p className="dirA-section-h" style={{marginTop: 20}}>Connectors usage rules</p>
            <p className="dirA-prose" style={{marginTop: 12}}><strong>MCP connectors require central approval</strong><br />Default position: no MCP connectors. To request one, contact the <a href="mailto:aiteam@miroma.com">AI team</a> and your IT provider. Requests are assessed case-by-case based on use case, data scope, and risk.<br />Any approved connector must be scoped to a specific folder or workspace — not a full account.<br /><em><strong>Why:</strong> MCP connectors give Claude live access to other systems. Without scope controls they can pull personal data, confidential client information, or HR records into a session without anyone realising. They also consume tokens at 15–80× the rate of a normal upload.</em></p>
            <p className="dirA-prose" style={{marginTop: 12}}><strong>No MCP connection to email systems</strong><br />Gmail, Outlook, and any other inbox integration is blocked.<br /><em><strong>Why:</strong> Email contains personal data, client confidential information, and HR matters in unpredictable combinations. There is no scope control granular enough to make this safe.</em></p>
          </div>

          {sb('s2_connectors')}
        </CPStage>

        {/* STAGE 7 — Put Claude to work (pending approval) */}
        <CPStage n="07" stageId="stage7" title="Put Claude to work" sub="Delegate tasks. Get finished work back." time="~10 min" done={completed.has(7)} onComplete={() => completeStage(7)} isActive={openStage === 7} badge="In Legal review">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <CPVideo id="UAmKyyZ-b9E" label="Claude — Cowork" title="Introducing Cowork" duration="1:08" />
            <CPVideo id="LpGpwhORWr0" label="Claude — Office" title="Slides, spreadsheets & documents" duration="1:38" />
            <CPVideo id="rBJnWMD0Pho" label="Claude — Browser" title="Let Claude handle work in your browser" duration="1:35" />
          </div>

          <div className="dirA-tip">
            <strong>In Legal review.</strong> Cowork and the Office add-ins are currently under Legal review and are not approved for use on Miroma or client work. Do not use these features until approval is granted. For status updates or to discuss a use case, contact the <a href="mailto:aiteam@miroma.com" style={{color: 'inherit', textDecoration: 'underline'}}>AI team</a>.
          </div>

          <div>
            <p className="dirA-section-h">What is Cowork?</p>
            <p className="dirA-prose">Claude Cowork handles tasks autonomously. Give it a goal and Claude works on your computer, local files, and applications to return a finished deliverable. If it's repetitive, messy, or just taking too long, assign it to Claude.</p>
            <p className="dirA-section-h" style={{marginTop: 20}}>Cowork usage rules</p>
            <p className="dirA-prose"><strong>Cowork currently not permitted.</strong> While we work out the data concerns around Cowork, particularly providing it with folder access, we ask that for now this is not used. It is currently disabled in your agency instance.</p>
            <p className="dirA-prose" style={{marginTop: 12}}><strong>Why:</strong> Cowork gives Claude access to files on your local machine. Without scope controls it can read, summarise, or surface anything in its reach, including data the user has forgotten is there. Restricting Cowork while we assess provides protection against data leaks.</p>
          </div>

          <div>
            <p className="dirA-section-h">Get going with the Office add-ins</p>
            <ol className="dirA-steps">
              <CPStep n="1" head="Install the Office add-ins" body={<>Visit <a href="https://claude.com/download" target="_blank" rel="noopener noreferrer">claude.com/download</a> and install the add-ins for Word, Excel, and PowerPoint. These are separate from the desktop app — scroll down the page to find them.</>} />
              <CPStep n="2" head="Open Word, Excel, or PowerPoint" body={<>Once installed, open any Office app and click the <strong>Claude</strong> icon in the ribbon to open the panel.</>} />
              <CPStep n="3" head="Try it on a real document" body="Use one of the prompts below directly inside your document. Claude can read what's already on the page without you needing to paste anything." />
            </ol>
          </div>

          {sb('s3_office_word')}
          {sb('s3_office_pptx')}
          {sb('s3_office_excel')}
        </CPStage>

      </div>

      {/* Which Claude quiz */}
      <WhichClaude />

      {/* Model tier guidance */}
      <div className="wc-quiz" style={{marginTop: 0}}>
        <div className="wc-quiz__header">
          <p className="dirA-hero-eyebrow">Quick Reference · Usage</p>
          <h2 className="wc-quiz__title">Which model tier should you use?</h2>
          <p className="wc-quiz__sub">Claude.ai gives you three model options. Opus costs 5× more than Sonnet per token — defaulting to it burns through your allowance quickly. Start with Sonnet for everything and only escalate when you need to.</p>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, padding: '0 32px 32px'}}>
          {[
            {
              name: 'Haiku',
              tag: null,
              use: 'Simple, fast tasks — classification, tagging, sorting, and quick summaries.',
              when: 'Use for high-volume or batch tasks where speed matters more than depth.',
            },
            {
              name: 'Sonnet',
              tag: 'Default',
              use: 'Writing, research, analysis, strategy, and almost all day-to-day work.',
              when: 'Start here. The right choice for the vast majority of tasks.',
            },
            {
              name: 'Opus',
              tag: null,
              use: 'Deep analysis, complex multi-step reasoning, and high-stakes strategic work.',
              when: "Only escalate here when Sonnet genuinely isn't producing what you need.",
            },
          ].map(tier => (
            <div key={tier.name} style={{
              border: tier.tag ? '2px solid #e8c840' : '1px solid #e5e5e5',
              borderRadius: 8,
              padding: '20px',
              background: tier.tag ? '#fffef5' : 'var(--c-bg, #fff)',
            }}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10}}>
                <strong style={{fontSize: 15, fontFamily: 'var(--font-display, sans-serif)'}}>{tier.name}</strong>
                {tier.tag && <span style={{fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: '#e8c840', padding: '2px 7px', borderRadius: 3}}>{tier.tag}</span>}
              </div>
              <p style={{fontSize: 13, margin: '0 0 8px', color: 'var(--c-text, #111)'}}>{tier.use}</p>
              <p style={{fontSize: 12, margin: 0, color: 'var(--c-stone, #888)'}}>{tier.when}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="dirA-footer">
        <p className="dirA-hero-eyebrow" style={{ justifyContent: 'center', marginBottom: 16 }}>What's next</p>
        <h2>Put it into practice.</h2>
        <p className="dirA-prose dirA-muted" style={{ maxWidth: '52ch', margin: '0 auto 16px', textAlign: 'center', fontSize: 15 }}>
          The best way to learn Claude is to use it on real work. Browse use cases for inspiration, or get in touch with your agency's AI champions and the Miroma AI team for hands-on support and further training.
        </p>
        <p className="dirA-prose dirA-muted" style={{ maxWidth: '52ch', margin: '0 auto 32px', textAlign: 'center', fontSize: 13 }}>
          Something look wrong? If an output seems off, or you think data has gone somewhere it shouldn't — <a href="mailto:aiteam@miroma.com">tell the AI team immediately</a>. If personal data or confidential information is involved, also tell Legal.
        </p>
        <div className="dirA-footer-actions">
          <a className="dirA-cta" href="https://claude.ai" target="_blank" rel="noopener noreferrer">Launch Claude →</a>
          <a className="dirA-cta dirA-cta--ghost" href="use-cases.html">Browse use cases</a>
          <a className="dirA-cta dirA-cta--ghost" href="https://anthropic.skilljar.com/" target="_blank" rel="noopener noreferrer">Claude courses</a>
          <a className="dirA-cta dirA-cta--ghost" href="mailto:aiteam@miroma.com">Contact the AI team</a>
        </div>
      </div>

    </div>
  );
}

// Mount when DOM is ready
(function mount() {
  const root = document.getElementById('cp-root');
  if (!root) return;
  ReactDOM.createRoot(root).render(React.createElement(ClaudePathway));
})();

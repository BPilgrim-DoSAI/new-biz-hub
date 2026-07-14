/* eslint-disable */
/**
 * PromptSandbox — interactive prompt blocks for the Claude onboarding pathway.
 * [SLOT] tokens become editable inline inputs. Copy or "Try in Claude →" actions
 * fill slots with current values before acting.
 */

function buildSegments(text) {
  const re = /\[([A-Z_]+)\]/g;
  const segments = [];
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'slot', name: match[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

function PromptSandbox({ promptKey, role = 'all', slotValues = {}, onSlotChange }) {
  const entry = CP_PROMPTS[promptKey];
  if (!entry) return null;
  const text = entry.text[role] || entry.text.all;
  const [copied, setCopied] = React.useState(false);
  const segments = React.useMemo(() => buildSegments(text), [text]);

  const handleCopy = () => {
    const filled = cpFillTemplate(text, slotValues);
    navigator.clipboard.writeText(filled).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      // Fallback for non-HTTPS
      const ta = document.createElement('textarea');
      ta.value = filled;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const handleOpenInClaude = () => {
    const filled = cpFillTemplate(text, slotValues);
    const isLive = entry.badge === 'live';
    const copyFn = () => {
      if (navigator.clipboard) {
        return navigator.clipboard.writeText(filled);
      }
      const ta = document.createElement('textarea');
      ta.value = filled;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    };
    copyFn().then(() => {
      window.open(isLive ? 'https://claude.com/download' : 'https://claude.ai/new', '_blank', 'noopener,noreferrer');
    });
  };

  return (
    <div className="ps">
      <div className="ps__head">
        <div className="ps__head-l">
          <p className="ps__label">{entry.label}</p>
          {entry.badge === 'live' && (
            <span className="ps__badge ps__badge--live">⚡ Live Artifact</span>
          )}
        </div>
        <div className="ps__actions">
          <button className="ps__btn ps__btn--ghost" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button className="ps__btn ps__btn--primary" onClick={handleOpenInClaude}>
            {entry.badge === 'live' ? 'Open Cowork →' : 'Try in Claude →'}
          </button>
        </div>
      </div>
      <div className="ps__body">
        <p className="ps__text">
          {segments.map((seg, i) => {
            if (seg.kind === 'text') return <span key={i}>{seg.value}</span>;
            const value = slotValues[seg.name] || '';
            const placeholder = CP_SLOT_DEFAULTS[seg.name] || seg.name.toLowerCase().replace(/_/g, ' ');
            return (
              <input
                key={i}
                className="ps__slot"
                style={{ width: `${Math.max(placeholder.length, (value || '').length) + 2}ch` }}
                value={value}
                placeholder={placeholder}
                onChange={e => onSlotChange && onSlotChange(seg.name, e.target.value)}
              />
            );
          })}
        </p>
      </div>
      {entry.whyItWorks && (
        <div className="ps__why">
          <span className="ps__why-label">Why it works</span>
          <span className="ps__why-text">{entry.whyItWorks}</span>
        </div>
      )}
    </div>
  );
}

window.PromptSandbox = PromptSandbox;

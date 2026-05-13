// event-submission.jsx — two WYSIWYG variations of Outsy's event submission
// Both edit the live event card. They differ in layout, image treatment, mood.

const { useState, useEffect, useRef } = React;

// ── Brand tokens ─────────────────────────────────────────────────────────
const OUTSY = {
  primary50: '#5EA8FF',
  primary: '#3B82F6',
  primaryDeep: '#2563EB',
  bgTop: '#435C7A',
  bgBottom: '#0B0F14',
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.38)',
  surface: 'rgba(255,255,255,0.05)',
  surfaceHi: 'rgba(255,255,255,0.08)',
  stroke: 'rgba(255,255,255,0.10)',
  strokeHi: 'rgba(255,255,255,0.18)',
  font: 'Inter, -apple-system, system-ui, sans-serif',
};

// ── Icons (lightweight inline SVGs) ─────────────────────────────────────
const Icon = {
  back: (c = '#fff') => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7l5 5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  globe: (c = '#fff') => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke={c} strokeWidth="1.4"/>
      <path d="M1.5 7h11M7 1.5c1.7 1.7 2.5 3.5 2.5 5.5s-.8 3.8-2.5 5.5C5.3 10.8 4.5 9 4.5 7s.8-3.8 2.5-5.5z" stroke={c} strokeWidth="1.4"/>
    </svg>
  ),
  lock: (c = '#fff') => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2.5" y="6.5" width="9" height="6" rx="1.4" stroke={c} strokeWidth="1.4"/>
      <path d="M4.5 6.5V4.3a2.5 2.5 0 015 0v2.2" stroke={c} strokeWidth="1.4"/>
    </svg>
  ),
  image: (c = '#fff', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2.5" stroke={c} strokeWidth="1.4"/>
      <circle cx="6.5" cy="6.5" r="1.2" fill={c}/>
      <path d="M3 13l3.5-3.5 3 3L13 8l2.5 2.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  calendar: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.6" stroke={c} strokeWidth="1.4"/>
      <path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  pin: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <path d="M7 13c3-3.4 4.5-5.8 4.5-7.7A4.5 4.5 0 002.5 5.3C2.5 7.2 4 9.6 7 13z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="7" cy="5.5" r="1.5" stroke={c} strokeWidth="1.4"/>
    </svg>
  ),
  text: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h6" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  users: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <circle cx="5.5" cy="5" r="2.3" stroke={c} strokeWidth="1.3"/>
      <path d="M1.5 12c0-2 1.8-3.4 4-3.4s4 1.4 4 3.4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M9 5.5a2 2 0 100-3M11 11.5c0-1.5-1-2.6-2.4-3" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  ticket: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <path d="M2 4.5a1 1 0 011-1h8a1 1 0 011 1v1.2a1.3 1.3 0 000 2.6v1.2a1 1 0 01-1 1H3a1 1 0 01-1-1V8.3a1.3 1.3 0 000-2.6V4.5z" stroke={c} strokeWidth="1.3"/>
      <path d="M6 4v6" stroke={c} strokeWidth="1.3" strokeDasharray="1 1.4"/>
    </svg>
  ),
  clock: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.3" stroke={c} strokeWidth="1.3"/>
      <path d="M7 4v3.2l2 1.3" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  plus: (c = '#fff', s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none">
      <path d="M6 2v8M2 6h8" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  check: (c = '#fff', s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none">
      <path d="M2 6.5l2.7 2.7L10 3.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  arrow: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  sparkle: (c = '#fff', s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none">
      <path d="M6 1l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill={c}/>
    </svg>
  ),
  close: (c = '#fff', s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
};

// ── Sample filled data ──────────────────────────────────────────────────
const SAMPLE = {
  title: 'Rooftop Sunset Drinks',
  date: 'Sat, Aug 16',
  time: '7:00 PM',
  location: 'Le Perchoir',
  locationDetail: 'Paris, 11ᵉ',
  description: 'Casual drinks to wind down the week — bring a friend and a smile. We\'ll grab the corner with the best view of the rooftops.',
  spots: 24,
  cost: 'Free',
  rsvpBy: 'Aug 14',
  hostName: 'Noah',
};

// ── Shared bits ─────────────────────────────────────────────────────────
function VisibilityPill({ visibility, setVisibility, dark = true }) {
  const itemStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 999,
    fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
    color: active ? '#fff' : 'rgba(255,255,255,0.6)',
    background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
    boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.18)' : 'none',
    cursor: 'pointer', transition: 'all .18s',
  });
  return (
    <div style={{
      display: 'inline-flex', padding: 3, borderRadius: 999,
      background: 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
    }}>
      <div style={itemStyle(visibility === 'public')} onClick={() => setVisibility('public')}>
        {Icon.globe(visibility === 'public' ? '#fff' : 'rgba(255,255,255,0.55)')}
        Public
      </div>
      <div style={itemStyle(visibility === 'private')} onClick={() => setVisibility('private')}>
        {Icon.lock(visibility === 'private' ? '#fff' : 'rgba(255,255,255,0.55)')}
        Private
      </div>
    </div>
  );
}

function PillIconBtn({ children, onClick, style = {} }) {
  return (
    <div onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 999,
      background: 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', flexShrink: 0,
      ...style,
    }}>{children}</div>
  );
}

// Editable text field that looks like its final rendered self
function FieldInline({
  value, placeholder, onChange, font, color, size, weight, lh,
  multiline = false, maxLength, textAlign = 'left',
  width = '100%', minWidth,
}) {
  const ref = useRef(null);
  const empty = !value;
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      ref={ref}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      rows={multiline ? 3 : undefined}
      style={{
        all: 'unset',
        display: multiline ? 'block' : 'inline-block',
        width, minWidth, boxSizing: 'border-box',
        fontFamily: font || OUTSY.font,
        fontSize: size, fontWeight: weight,
        lineHeight: lh || 1.2,
        color: empty ? OUTSY.textFaint : (color || '#fff'),
        letterSpacing: -0.2, textAlign,
        resize: 'none', cursor: 'text',
      }}
    />
  );
}

// "Optional field" chip — each field has its own icon (no +/check toggle).
// Active state recolors to primary; inactive sits in muted glass.
function OptionalChip({ iconFn, label, active, onClick }) {
  const color = active ? OUTSY.primary50 : 'rgba(255,255,255,0.78)';
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '8px 13px 8px 11px', borderRadius: 999,
      background: active ? 'rgba(94,168,255,0.14)' : 'rgba(255,255,255,0.05)',
      boxShadow: `inset 0 0 0 1px ${active ? 'rgba(94,168,255,0.38)' : 'rgba(255,255,255,0.10)'}`,
      color, fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1,
      cursor: 'pointer', transition: 'all .18s', whiteSpace: 'nowrap',
    }}>
      {iconFn(color, 13)}
      {label}
    </div>
  );
}

// ── Hosted-by block (shared) ────────────────────────────────────────────
function HostedBy({ name = 'Noah' }) {
  return (
    <div style={{
      borderRadius: 22, padding: '18px 16px 20px',
      background: 'rgba(255,255,255,0.04)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600, letterSpacing: -0.1, whiteSpace: 'nowrap' }}>
        Hosted by
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* host avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 999,
            background: 'linear-gradient(135deg, #d8b394 0%, #8a5a3b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 16,
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.25)',
          }}>{name[0]}</div>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>{name}</div>
        </div>
        {/* add cohost — dashed avatar slot */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          cursor: 'pointer',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 999,
            border: '1.5px dashed rgba(255,255,255,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.02)',
            transition: 'all .18s',
          }}>
            {Icon.plus('rgba(255,255,255,0.7)', 14)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 500 }}>Cohost</div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// VARIATION A — "Composer Card"
// Image as framed rounded hero card. Glass surfaces, calm/minimal mood.
// Optional fields as a row of "+ Add" chips above sticky publish bar.
// ────────────────────────────────────────────────────────────────────────
function VariantA({ filled }) {
  const [visibility, setVisibility] = useState('public');
  const [title, setTitle] = useState(filled ? SAMPLE.title : '');
  const [date, setDate] = useState(filled ? SAMPLE.date : '');
  const [time, setTime] = useState(filled ? SAMPLE.time : '');
  const [location, setLocation] = useState(filled ? SAMPLE.location : '');
  const [locationDetail, setLocationDetail] = useState(filled ? SAMPLE.locationDetail : '');

  const [optsOpen, setOptsOpen] = useState({
    description: filled, spots: filled, cost: filled, rsvp: filled,
  });
  const [description, setDescription] = useState(filled ? SAMPLE.description : '');
  const [spots, setSpots] = useState(filled ? String(SAMPLE.spots) : '');
  const [cost, setCost] = useState(filled ? SAMPLE.cost : '');
  const [rsvpBy, setRsvpBy] = useState(filled ? SAMPLE.rsvpBy : '');

  useEffect(() => {
    setTitle(filled ? SAMPLE.title : '');
    setDate(filled ? SAMPLE.date : '');
    setTime(filled ? SAMPLE.time : '');
    setLocation(filled ? SAMPLE.location : '');
    setLocationDetail(filled ? SAMPLE.locationDetail : '');
    setDescription(filled ? SAMPLE.description : '');
    setSpots(filled ? String(SAMPLE.spots) : '');
    setCost(filled ? SAMPLE.cost : '');
    setRsvpBy(filled ? SAMPLE.rsvpBy : '');
    setOptsOpen({
      description: filled, spots: filled, cost: filled, rsvp: filled,
    });
  }, [filled]);

  const ready = title && date && location;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `linear-gradient(180deg, ${OUTSY.bgTop} 0%, ${OUTSY.bgBottom} 60%)`,
      fontFamily: OUTSY.font,
      color: '#fff',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Top bar: back + visibility */}
      <div style={{
        position: 'absolute', top: 56, left: 0, right: 0,
        padding: '0 16px', zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <PillIconBtn>{Icon.back()}</PillIconBtn>
        <VisibilityPill visibility={visibility} setVisibility={setVisibility} />
        <div style={{ width: 36 }} />
      </div>

      {/* Scroll body */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '108px 16px 140px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Image hero card */}
        <ImageCardA filled={filled} />

        {/* Title + date + location card */}
        <div style={{
          borderRadius: 24, padding: '22px 20px',
          background: 'rgba(255,255,255,0.04)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <FieldInline
            value={title} onChange={setTitle}
            placeholder="Event title"
            size={28} weight={700} lh={1.15}
          />
          {/* date row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FieldChip icon={Icon.calendar('rgba(255,255,255,0.8)')}>
              <FieldInline value={date} onChange={setDate} placeholder="Date"
                size={14} weight={500} />
            </FieldChip>
            <FieldChip icon={Icon.clock('rgba(255,255,255,0.8)')}>
              <FieldInline value={time} onChange={setTime} placeholder="Time"
                size={14} weight={500} />
            </FieldChip>
          </div>
          {/* location row */}
          <FieldChip icon={Icon.pin('rgba(255,255,255,0.8)')} full>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <FieldInline value={location} onChange={setLocation} placeholder="Location"
                size={14} weight={500} />
              {(locationDetail || location) && (
                <FieldInline value={locationDetail} onChange={setLocationDetail}
                  placeholder="Add detail (optional)" size={12} weight={400}
                  color="rgba(255,255,255,0.55)" />
              )}
            </div>
          </FieldChip>
        </div>

        {/* Optional fields */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
            color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
            padding: '0 4px 10px',
          }}>Add more details</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <OptionalChip iconFn={(c, s) => Icon.text(c, s)} label="Description"
              active={optsOpen.description}
              onClick={() => setOptsOpen(o => ({ ...o, description: !o.description }))} />
            <OptionalChip iconFn={(c, s) => Icon.users(c, s)} label="Spots"
              active={optsOpen.spots}
              onClick={() => setOptsOpen(o => ({ ...o, spots: !o.spots }))} />
            <OptionalChip iconFn={(c, s) => Icon.ticket(c, s)} label="Cost"
              active={optsOpen.cost}
              onClick={() => setOptsOpen(o => ({ ...o, cost: !o.cost }))} />
            <OptionalChip iconFn={(c, s) => Icon.calendar(c, s)} label="RSVP by"
              active={optsOpen.rsvp}
              onClick={() => setOptsOpen(o => ({ ...o, rsvp: !o.rsvp }))} />
          </div>

          {/* Expanded optional inputs */}
          {(optsOpen.description || optsOpen.spots || optsOpen.cost || optsOpen.rsvp) && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {optsOpen.description && (
                <OptionalCard label="Description" iconFn={(c) => Icon.text(c, 12)}>
                  <FieldInline value={description} onChange={setDescription}
                    placeholder="What's the vibe? Who should come?"
                    size={14} weight={400} lh={1.5} multiline />
                </OptionalCard>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {optsOpen.spots && (
                  <OptionalInlineRow label="Spots" iconFn={(c) => Icon.users(c, 13)} half>
                    <FieldInline value={spots} onChange={setSpots}
                      placeholder="∞" size={14} weight={600} textAlign="right" />
                  </OptionalInlineRow>
                )}
                {optsOpen.cost && (
                  <OptionalInlineRow label="Cost" iconFn={(c) => Icon.ticket(c, 13)} half>
                    <FieldInline value={cost} onChange={setCost}
                      placeholder="Free" size={14} weight={600} textAlign="right" />
                  </OptionalInlineRow>
                )}
              </div>
              {optsOpen.rsvp && (
                <OptionalInlineRow label="RSVP by" iconFn={(c) => Icon.calendar(c, 13)}>
                  <FieldInline value={rsvpBy} onChange={setRsvpBy}
                    placeholder="Pick a date" size={14} weight={500} textAlign="right" />
                </OptionalInlineRow>
              )}
            </div>
          )}
        </div>

        <HostedBy />
      </div>

      {/* Sticky publish bar */}
      <StickyPreview />
    </div>
  );
}

function ImageCardA({ filled }) {
  return (
    <div style={{
      borderRadius: 22, height: 240, flexShrink: 0,
      background: filled
        ? 'linear-gradient(135deg, #f6a47a 0%, #d97050 35%, #4a3559 75%, #1f2840 100%)'
        : 'linear-gradient(180deg, rgba(94,168,255,0.10) 0%, rgba(94,168,255,0.04) 100%)',
      boxShadow: filled
        ? '0 12px 30px rgba(0,0,0,0.35)'
        : 'inset 0 0 0 1.5px rgba(94,168,255,0.35)',
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 10,
    }}>
      {filled ? (
        <>
          {/* placeholder "photo" — sunset rooftop vibe */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 70% 30%, rgba(255,200,140,0.6), transparent 60%), linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.35) 100%)',
          }} />
          {/* persistent replace control */}
          <div style={{
            position: 'absolute', top: 14, right: 14,
            padding: '9px 14px 9px 11px', borderRadius: 999,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22), 0 4px 14px rgba(0,0,0,0.3)',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: -0.1,
          }}>
            {Icon.image('#fff', 14)} Replace photo
          </div>
        </>
      ) : (
        <>
          {/* subtle diagonal pattern hint */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.4,
            backgroundImage: 'repeating-linear-gradient(135deg, rgba(94,168,255,0.06) 0px, rgba(94,168,255,0.06) 1px, transparent 1px, transparent 14px)',
          }} />
          <div style={{
            width: 64, height: 64, borderRadius: 999,
            background: `linear-gradient(180deg, ${OUTSY.primary50} 0%, ${OUTSY.primary} 100%)`,
            boxShadow: '0 8px 24px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
          }}>{Icon.image('#fff', 26)}</div>
          <div style={{
            fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: -0.1,
            position: 'relative', zIndex: 1,
          }}>Add a cover photo</div>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: -4,
            position: 'relative', zIndex: 1,
          }}>Tap to upload · Recommended 3:2</div>
        </>
      )}
    </div>
  );
}

function FieldChip({ icon, children, full = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 14,
      background: 'rgba(255,255,255,0.04)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      flex: full ? '1 1 100%' : 1, minWidth: 0,
    }}>
      <div style={{ flexShrink: 0, display: 'flex' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function OptionalCard({ label, iconFn, children, half = false }) {
  return (
    <div style={{
      flex: half ? 1 : 'unset', minWidth: 0,
      borderRadius: 14, padding: '10px 14px 12px',
      background: 'rgba(94,168,255,0.05)',
      boxShadow: 'inset 0 0 0 1px rgba(94,168,255,0.22)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {iconFn(OUTSY.primary50)}
        <div style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4,
          color: OUTSY.primary50, textTransform: 'uppercase',
        }}>{label}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

// Single-line compact row for Spots / Cost / RSVP — icon + label left, value right.
function OptionalInlineRow({ label, iconFn, children, half = false }) {
  return (
    <div style={{
      flex: half ? 1 : 'unset', minWidth: 0,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 12,
      background: 'rgba(94,168,255,0.05)',
      boxShadow: 'inset 0 0 0 1px rgba(94,168,255,0.22)',
    }}>
      <div style={{ flexShrink: 0, display: 'flex' }}>{iconFn(OUTSY.primary50)}</div>
      <div style={{
        fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.82)',
        flexShrink: 0, letterSpacing: -0.1,
      }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function StickyPreview({ compact = false }) {
  if (compact) {
    return (
      <div style={{
        position: 'absolute', bottom: 30, right: 16, zIndex: 20,
      }}>
        <div style={{
          height: 44, padding: '0 18px', borderRadius: 999,
          background: `linear-gradient(180deg, ${OUTSY.primary50} 0%, ${OUTSY.primary} 50%, ${OUTSY.primaryDeep} 100%)`,
          boxShadow: '0 8px 24px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
          display: 'inline-flex', alignItems: 'center', gap: 7,
          color: '#fff', fontSize: 14.5, fontWeight: 600, letterSpacing: -0.1,
          cursor: 'pointer', transition: 'all .2s',
        }}>
          Preview
          {Icon.arrow('#fff', 14)}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 16px 30px',
      background: 'linear-gradient(180deg, rgba(11,15,20,0) 0%, rgba(11,15,20,0.85) 35%, rgba(11,15,20,1) 100%)',
      pointerEvents: 'none',
    }}>
      <div style={{
        height: 52, borderRadius: 16,
        background: `linear-gradient(180deg, ${OUTSY.primary50} 0%, ${OUTSY.primary} 50%, ${OUTSY.primaryDeep} 100%)`,
        boxShadow: '0 8px 24px rgba(59,130,246,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        color: '#fff', fontSize: 16, fontWeight: 600, letterSpacing: -0.1,
        pointerEvents: 'auto', cursor: 'pointer', transition: 'all .2s',
      }}>
        Preview
        {Icon.arrow('#fff', 16)}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// VARIATION B — "Immersive Hero"
// Photo is the page; content floats on a glass card slid up from the bottom.
// More vivid. Optional fields surface as a checklist below the core block.
// ────────────────────────────────────────────────────────────────────────
function VariantB({ filled }) {
  const [visibility, setVisibility] = useState('public');
  const [title, setTitle] = useState(filled ? SAMPLE.title : '');
  const [date, setDate] = useState(filled ? `${SAMPLE.date} · ${SAMPLE.time}` : '');
  const [location, setLocation] = useState(filled ? `${SAMPLE.location} · ${SAMPLE.locationDetail}` : '');

  const [optsOpen, setOptsOpen] = useState({
    description: filled, spots: filled, cost: filled, rsvp: filled,
  });
  const [description, setDescription] = useState(filled ? SAMPLE.description : '');
  const [spots, setSpots] = useState(filled ? String(SAMPLE.spots) : '');
  const [cost, setCost] = useState(filled ? SAMPLE.cost : '');
  const [rsvpBy, setRsvpBy] = useState(filled ? SAMPLE.rsvpBy : '');

  useEffect(() => {
    setTitle(filled ? SAMPLE.title : '');
    setDate(filled ? `${SAMPLE.date} · ${SAMPLE.time}` : '');
    setLocation(filled ? `${SAMPLE.location} · ${SAMPLE.locationDetail}` : '');
    setDescription(filled ? SAMPLE.description : '');
    setSpots(filled ? String(SAMPLE.spots) : '');
    setCost(filled ? SAMPLE.cost : '');
    setRsvpBy(filled ? SAMPLE.rsvpBy : '');
    setOptsOpen({ description: filled, spots: filled, cost: filled, rsvp: filled });
  }, [filled]);

  const ready = title && date && location;

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      background: OUTSY.bgBottom,
      fontFamily: OUTSY.font, color: '#fff',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Full-bleed image / placeholder hero */}
      <ImageHeroB filled={filled} />

      {/* Top bar over hero */}
      <div style={{
        position: 'absolute', top: 56, left: 0, right: 0,
        padding: '0 16px', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <PillIconBtn>{Icon.back()}</PillIconBtn>
        <VisibilityPill visibility={visibility} setVisibility={setVisibility} />
        <div style={{ width: 36 }} />
      </div>

      {/* Scroll body */}
      <div style={{
        flex: 1, overflow: 'auto', position: 'relative', zIndex: 2,
        padding: '300px 0 110px',
      }}>
        {/* Title block — over image fade */}
        <div style={{ padding: '0 20px 18px', textAlign: 'center' }}>
          <FieldInline
            value={title} onChange={setTitle}
            placeholder="Event title"
            size={32} weight={700} lh={1.1}
            textAlign="center"
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {Icon.calendar('rgba(255,255,255,0.85)', 15)}
              <FieldInline value={date} onChange={setDate}
                placeholder="Date & time" size={14} weight={500}
                textAlign="center" width="auto" minWidth={130} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {Icon.pin('rgba(255,255,255,0.85)', 15)}
              <FieldInline value={location} onChange={setLocation}
                placeholder="Location" size={14} weight={500}
                textAlign="center" width="auto" minWidth={130} />
            </div>
          </div>
        </div>

        {/* Glass content panel */}
        <div style={{
          margin: '20px 12px 0', borderRadius: 26,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.4)',
          padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
            color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
            padding: '2px 4px 0',
          }}>Add more details</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <OptionalChip iconFn={(c, s) => Icon.text(c, s)} label="Description"
              active={optsOpen.description}
              onClick={() => setOptsOpen(o => ({ ...o, description: !o.description }))} />
            <OptionalChip iconFn={(c, s) => Icon.users(c, s)} label="Spots"
              active={optsOpen.spots}
              onClick={() => setOptsOpen(o => ({ ...o, spots: !o.spots }))} />
            <OptionalChip iconFn={(c, s) => Icon.ticket(c, s)} label="Cost"
              active={optsOpen.cost}
              onClick={() => setOptsOpen(o => ({ ...o, cost: !o.cost }))} />
            <OptionalChip iconFn={(c, s) => Icon.calendar(c, s)} label="RSVP by"
              active={optsOpen.rsvp}
              onClick={() => setOptsOpen(o => ({ ...o, rsvp: !o.rsvp }))} />
          </div>

          {(optsOpen.description || optsOpen.spots || optsOpen.cost || optsOpen.rsvp) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
              {optsOpen.description && (
                <OptionalCard label="Description" iconFn={(c) => Icon.text(c, 12)}>
                  <FieldInline value={description} onChange={setDescription}
                    placeholder="What's the vibe? Who should come?"
                    size={13.5} weight={400} lh={1.45} multiline />
                </OptionalCard>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {optsOpen.spots && (
                  <OptionalInlineRow label="Spots" iconFn={(c) => Icon.users(c, 13)} half>
                    <FieldInline value={spots} onChange={setSpots}
                      placeholder="∞" size={14} weight={600} textAlign="right" />
                  </OptionalInlineRow>
                )}
                {optsOpen.cost && (
                  <OptionalInlineRow label="Cost" iconFn={(c) => Icon.ticket(c, 13)} half>
                    <FieldInline value={cost} onChange={setCost}
                      placeholder="Free" size={14} weight={600} textAlign="right" />
                  </OptionalInlineRow>
                )}
              </div>
              {optsOpen.rsvp && (
                <OptionalInlineRow label="RSVP by" iconFn={(c) => Icon.calendar(c, 13)}>
                  <FieldInline value={rsvpBy} onChange={setRsvpBy}
                    placeholder="Pick a date" size={14} weight={500} textAlign="right" />
                </OptionalInlineRow>
              )}
            </div>
          )}
        </div>

        {/* Hosted by */}
        <div style={{ padding: '18px 12px 0' }}>
          <HostedBy />
        </div>
      </div>

      <StickyPreview compact />
    </div>
  );
}

function ImageHeroB({ filled }) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: 360, zIndex: 1, overflow: 'hidden', cursor: 'pointer',
    }}>
      {filled ? (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 60% 35%, #ffb070 0%, #d97050 25%, #6a3a55 55%, #2a2540 80%, #0B0F14 100%)',
          }} />
          {/* soft glow */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 55% 25%, rgba(255,220,170,0.4) 0%, transparent 50%)',
          }} />
          {/* prominent change-photo pill */}
          <div style={{
            position: 'absolute', top: 108, right: 16,
            padding: '11px 16px 11px 13px', borderRadius: 999, zIndex: 5,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25), 0 6px 20px rgba(0,0,0,0.4)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 13.5, fontWeight: 600, color: '#fff', letterSpacing: -0.1,
          }}>
            {Icon.image('#fff', 16)} Change cover
          </div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 180,
            background: `linear-gradient(180deg, transparent 0%, ${OUTSY.bgBottom} 90%)`,
          }} />
        </>
      ) : (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, ${OUTSY.bgTop} 0%, #2a3a52 50%, ${OUTSY.bgBottom} 100%)`,
          }} />
          {/* Add-photo CTA in center of hero */}
          <div style={{
            position: 'absolute', top: 130, left: 0, right: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 999,
              background: `linear-gradient(180deg, ${OUTSY.primary50} 0%, ${OUTSY.primary} 100%)`,
              boxShadow: '0 10px 28px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.image('#fff', 30)}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
              Add a cover photo
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: -4 }}>
              Sets the mood for your invite
            </div>
          </div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
            background: `linear-gradient(180deg, transparent, ${OUTSY.bgBottom})`,
          }} />
        </>
      )}
    </div>
  );
}

// FieldCardB — a tappable row that expands to reveal an editor.
// Active state recolors the leading icon tile + label; no checkbox visuals.
function FieldCardB({
  label, iconFn, active, onToggle, empty, summary, children, compact = false,
}) {
  return (
    <div style={{
      flex: compact ? 1 : 'unset', minWidth: 0,
      borderRadius: 14, padding: compact ? '10px 12px' : '12px 14px',
      background: active ? 'rgba(94,168,255,0.08)' : 'rgba(255,255,255,0.025)',
      boxShadow: `inset 0 0 0 1px ${active ? 'rgba(94,168,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
      transition: 'all .2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
      }} onClick={onToggle}>
        {/* icon tile — no checkbox, just the field's icon, colored by state */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: active ? 'rgba(94,168,255,0.18)' : 'rgba(255,255,255,0.05)',
          boxShadow: `inset 0 0 0 1px ${active ? 'rgba(94,168,255,0.35)' : 'rgba(255,255,255,0.10)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .2s',
        }}>{iconFn(active ? OUTSY.primary50 : 'rgba(255,255,255,0.6)', 14)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: active ? '#fff' : 'rgba(255,255,255,0.92)',
            letterSpacing: -0.1,
          }}>{label}</div>
          {!compact && !active && (
            <div style={{
              fontSize: 11.5, fontWeight: 400, marginTop: 1,
              color: empty ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.7)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{summary}</div>
          )}
        </div>
        {compact && !active && (
          <div style={{
            fontSize: 12, fontWeight: 500,
            color: empty ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.75)',
          }}>{summary}</div>
        )}
      </div>
      {active && (
        <div style={{
          marginTop: compact ? 8 : 10, paddingTop: compact ? 8 : 10,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>{children}</div>
      )}
    </div>
  );
}

Object.assign(window, { VariantA, VariantB });

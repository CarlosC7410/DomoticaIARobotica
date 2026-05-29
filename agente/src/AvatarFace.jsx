import { useEffect, useRef, useState } from 'react';
import './AvatarFace.css';

const CFG = {
  neutral:   { rx: 16, ry: 12, color: '#4a9eff', mouth: 'M 52 100 Q 80 112 108 100' },
  happy:     { rx: 18, ry: 10, color: '#4ade80', mouth: 'M 46 95  Q 80 124 114 95'  },
  sad:       { rx: 14, ry: 9,  color: '#60a5fa', mouth: 'M 52 112 Q 80 94  108 112' },
  surprised: { rx: 18, ry: 18, color: '#f59e0b', mouth: 'M 66 98  Q 80 118 94  98'  },
  thinking:  { rx: 16, ry: 12, color: '#a78bfa', mouth: 'M 57 103 Q 80 99  103 103' },
};

const SPEAK_OPEN  = 'M 50 95  Q 80 120 110 95';
const SPEAK_CLOSE = 'M 54 102 Q 80 114 106 102';

export default function AvatarFace({ emotion = 'neutral', isThinking = false }) {
  const [blink, setBlink]         = useState(false);
  const [speakOpen, setSpeakOpen] = useState(false);
  const [dots, setDots]           = useState(0);
  const blinkTimer = useRef();

  // Random blink
  useEffect(() => {
    const schedule = () => {
      blinkTimer.current = setTimeout(() => {
        setBlink(true);
        setTimeout(() => { setBlink(false); schedule(); }, 130);
      }, 3000 + Math.random() * 2500);
    };
    schedule();
    return () => clearTimeout(blinkTimer.current);
  }, []);

  // Speaking oscillation
  useEffect(() => {
    if (emotion !== 'speaking') return;
    const id = setInterval(() => setSpeakOpen(p => !p), 220);
    return () => { clearInterval(id); setSpeakOpen(false); };
  }, [emotion]);

  // Thinking dots
  useEffect(() => {
    if (!isThinking) { setDots(0); return; }
    const id = setInterval(() => setDots(p => (p + 1) % 4), 380);
    return () => clearInterval(id);
  }, [isThinking]);

  const cfg  = CFG[emotion] || CFG.neutral;
  const eyeRy = blink ? 1 : cfg.ry;
  const mouth = emotion === 'speaking'
    ? (speakOpen ? SPEAK_OPEN : SPEAK_CLOSE)
    : cfg.mouth;

  return (
    <div className={`avatar-wrap avatar-${emotion}`}>
      <svg viewBox="0 0 160 170" xmlns="http://www.w3.org/2000/svg" className="avatar-svg">
        {/* Face plate */}
        <rect x="6" y="6" width="148" height="148" rx="34"
          fill="#0c0c1e" stroke={cfg.color} strokeWidth="2.5" />

        {/* Inner glow */}
        <rect x="6" y="6" width="148" height="148" rx="34"
          fill="none" stroke={cfg.color} strokeWidth="8" opacity="0.08" />

        {/* Left eye */}
        <ellipse cx="52" cy="64" rx={cfg.rx} ry={eyeRy}
          fill={cfg.color} className="avatar-eye" />
        {/* Left pupil reflection */}
        <ellipse cx="56" cy="59" rx="4" ry="3"
          fill="white" opacity="0.35" />

        {/* Right eye */}
        <ellipse cx="108" cy="64" rx={cfg.rx} ry={eyeRy}
          fill={cfg.color} className="avatar-eye" />
        {/* Right pupil reflection */}
        <ellipse cx="112" cy="59" rx="4" ry="3"
          fill="white" opacity="0.35" />

        {/* Mouth */}
        <path d={mouth} stroke={cfg.color} strokeWidth="4.5"
          fill="none" strokeLinecap="round" className="avatar-mouth" />

        {/* Thinking / speaking dots */}
        {(isThinking || emotion === 'thinking') && (
          <g className="avatar-dots">
            {[0, 1, 2].map(i => (
              <circle key={i}
                cx={64 + i * 16} cy={138}
                r={dots > i ? 5 : 2.5}
                fill={cfg.color}
                opacity={dots > i ? 1 : 0.25}
              />
            ))}
          </g>
        )}
      </svg>

      <div className="avatar-label" style={{ color: cfg.color }}>
        {isThinking ? 'pensando...' : emotion}
      </div>
    </div>
  );
}

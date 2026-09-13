import "./RobotFace.css";

const EMOTION_LABELS = {
  neutral: "Neutral",
  happy: "Feliz",
  excited: "Emocionado",
  sad: "Triste",
  surprised: "Sorprendido",
  thinking: "Pensando",
  speaking: "Hablando",
  listening: "Escuchando",
  sleeping: "Durmiendo",
  confused: "Confundido",
  angry: "Enojado",
  annoyed: "Serio molesto",
};

function Mouth({ emotion }) {
  if (emotion === "happy") {
    return (
      <svg className="mouth-svg mouth-happy" viewBox="0 0 190 110" aria-hidden="true">
        <path d="M 38 36 Q 95 92 152 36" />
      </svg>
    );
  }

  if (emotion === "excited") {
    return (
      <svg className="mouth-svg mouth-excited" viewBox="0 0 210 125" aria-hidden="true">
        <path d="M 34 36 Q 105 116 176 36" />
      </svg>
    );
  }

  if (emotion === "sad" || emotion === "angry") {
    return (
      <svg className="mouth-svg mouth-sad" viewBox="0 0 190 110" aria-hidden="true">
        <path d="M 38 78 Q 95 30 152 78" />
      </svg>
    );
  }

  if (emotion === "surprised") {
    return <div className="mouth-shape mouth-o" aria-hidden="true" />;
  }

  if (emotion === "speaking") {
    return <div className="mouth-shape mouth-speaking" aria-hidden="true" />;
  }

  if (emotion === "sleeping") {
    return <div className="mouth-shape mouth-sleep" aria-hidden="true" />;
  }

  if (emotion === "confused") {
    return <div className="mouth-shape mouth-confused-line" aria-hidden="true" />;
  }

  if (emotion === "annoyed") {
    return <div className="mouth-shape mouth-annoyed" aria-hidden="true" />;
  }

  return <div className="mouth-shape mouth-neutral" aria-hidden="true" />;
}

function Eye({ side, emotion }) {
  return (
    <div className={`eye ${side}-eye`}>
      <span className="eye-shine" />
    </div>
  );
}

function EmotionMarks({ emotion }) {
  if (emotion === "thinking") {
    return (
      <div className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (emotion === "sleeping") {
    return (
      <div className="sleeping-z" aria-hidden="true">
        <span>z</span>
        <span>Z</span>
        <span>Z</span>
      </div>
    );
  }

  if (emotion === "confused") {
    return (
      <div className="confused-marks" aria-hidden="true">
        <span className="dot">.</span>
        <span className="dot">.</span>
        <span className="dot">.</span>
        <span className="question">?</span>
      </div>
    );
  }

  return null;
}

function RobotFace({ emotion = "neutral", speaking = false, onClick }) {
  const currentEmotion = speaking ? "speaking" : emotion;
  const safeEmotion = EMOTION_LABELS[currentEmotion] ? currentEmotion : "neutral";

  return (
    <div
      className={`robot-screen ${safeEmotion}`}
      onClick={onClick}
      title="Toca para hablar"
      aria-label={`Cara de Charsbotai: ${EMOTION_LABELS[safeEmotion]}`}
    >
      <div className="robot-face">
        <EmotionMarks emotion={safeEmotion} />

        <div className="eyes">
          <Eye side="left" emotion={safeEmotion} />
          <Eye side="right" emotion={safeEmotion} />
        </div>

        <div className="mouth-area">
          <Mouth emotion={safeEmotion} />
        </div>
      </div>
    </div>
  );
}

export default RobotFace;

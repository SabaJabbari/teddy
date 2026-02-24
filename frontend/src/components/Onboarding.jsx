// src/components/Onboarding.jsx
import React, { useEffect, useMemo, useState } from "react";

// --- Styles (sanfte Farben) --------------------------------------------------
const cardStyle = {
  background: "#f3edff",
  color: "#1f2937",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 16,
  padding: 16,
};
const heroCardStyle = {
  background: "#f3edff",
  color: "#1f2937",
  border: "1px solid rgba(0,0,0,0.05)",
  borderRadius: 20,
  padding: 20,
  overflow: "hidden",
};
const headingStyle = { color: "#0f172a", marginTop: 0 };
const labelStyle = { color: "#374151", display: "block", marginBottom: 6 };
const helperStyle = { fontSize: 13, color: "#6b7280", marginBottom: 8 };
const greetingHeroStyle = {
  display: "flex",
  flexWrap: "nowrap",
  gap: 24,
  alignItems: "center",
  marginTop: 12,
};
const greetingImageWrapperStyle = {
  flex: "1 1 260px",
  minWidth: 220,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-end",
};
const greetingImageStyle = {
  width: "clamp(160px, 38vw, 280px)",
  maxHeight: "clamp(180px, 50vw, 280px)",
  height: "auto",
  borderRadius: 24,
  background: "transparent",
  objectFit: "contain",
};
const greetingImageMobileStyle = {
  width: 200,
  height: "auto",
  borderRadius: 24,
  background: "transparent",
  objectFit: "contain",
};
const greetingTextColumnStyle = {
  flex: "1 1 260px",
  minWidth: 220,
  background: "#fff",
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.07)",
  padding: "18px 22px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
  position: "relative",
};
const speechPointerStyle = {
  position: "absolute",
  left: -18,
  bottom: 20,
  width: 0,
  height: 0,
  borderTop: "18px solid transparent",
  borderBottom: "18px solid transparent",
  borderRight: "20px solid #fff",
  filter: "drop-shadow(-2px 3px 2px rgba(15, 23, 42, 0.1))",
};
const questionLayoutStyle = {
  minHeight: 320,
  display: "flex",
  gap: 30,
  alignItems: "flex-end",
  flexWrap: "wrap",
};
const questionImageWrapperStyle = {
  flex: "1 1 240px",
  minWidth: 180,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-end",
  minHeight: 260,
};
const questionImageStyle = {
  width: "clamp(180px, 45vw, 300px)",
  maxHeight: "clamp(200px, 55vw, 320px)",
  height: "auto",
  objectFit: "contain",
};
const questionContentStyle = {
  flex: "1 1 260px",
  minWidth: 240,
  background: "#fff",
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.07)",
  padding: "18px 22px",
  boxShadow: "0 8px 26px rgba(15, 23, 42, 0.10)",
  position: "relative",
};
const questionPointerStyle = {
  position: "absolute",
  left: -18,
  bottom: 24,
  width: 0,
  height: 0,
  borderTop: "16px solid transparent",
  borderBottom: "16px solid transparent",
  borderRight: "18px solid #fff",
  filter: "drop-shadow(-2px 2px 2px rgba(15, 23, 42, 0.08))",
};
const inputStyle = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 12,
  padding: "10px 12px",
  width: "100%",
};
const textAreaStyle = { ...inputStyle, minHeight: 96 };
const btnStyle = {
  marginTop: 10,
  background: "linear-gradient(90deg, #c4b5fd, #60a5fa)",
  color: "#0f172a",
  border: "none",
  boxShadow: "0 6px 20px rgba(96, 165, 250, 0.35)",
};

const WEATHER_KEYWORDS = {
  heavy: ["regnerisch", "stürmisch", "bewölkt"],
  bright: ["sonnig", "klar", "wärmender", "warm"],
};

const GREETING_PHOTO = {
  src: "/assets/teddy_model_welcome.png",
  title: "Coco winkt",
};
const QUESTION_TEDDY_SRC = "/assets/Teddy.png";
const QUESTION_TEDDY_SIT_SRC = "/assets/Teddy-sitz.png";

function QuestionShell({ children, variant = "default", isMobile }) {
  const imageSrc = variant === "sit" ? QUESTION_TEDDY_SIT_SRC : QUESTION_TEDDY_SRC;
  const rowLayout = isMobile
    ? {
        ...questionLayoutStyle,
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        minHeight: "auto",
        justifyContent: "center",
      }
    : { ...questionLayoutStyle, flexWrap: "nowrap", alignItems: "center" };
  const imageWrapper = isMobile
    ? { ...questionImageWrapperStyle, minWidth: 120, flex: "0 0 120px", minHeight: 130 }
    : questionImageWrapperStyle;
  const imageStyle = isMobile
    ? { ...questionImageStyle, width: 120, maxHeight: 200 }
    : questionImageStyle;
  const contentStyle = isMobile
    ? { ...questionContentStyle, flex: "1 1 200px", minWidth: 0, marginTop: 0 }
    : questionContentStyle;
  return (
    <div style={rowLayout}>
      <div style={imageWrapper}>
        <img
          src={imageSrc}
          alt="Teddy hört dir zu"
          style={imageStyle}
          loading="lazy"
        />
      </div>
      <div style={contentStyle}>
        {!isMobile && <span style={questionPointerStyle} aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}

// --- Analyse der Antworten -> Profil + Mapping auf deine Indizes -------------
function analyzeAnswers(a) {
  const text = `${a.safePlace} ${a.companionFeeling} ${a.familiarFeeling}`.toLowerCase();
  const wantsSoft = /(ruh|leise|sanft|geborgen|warm|umarm|halt|da sein|bei mir)/i.test(text);
  const humorous = /(witzig|humor|spielerisch|locker|spaß|lustig)/i.test(text);

  const heavyWeather = WEATHER_KEYWORDS.heavy.some((w) =>
    a.weather.toLowerCase().includes(w)
  );
  const brightWeather = WEATHER_KEYWORDS.bright.some((w) =>
    a.weather.toLowerCase().includes(w)
  );

  // pacing
  const pacing = wantsSoft || heavyWeather ? "sehr_langsam" : "ruhig";

  // tone
  let tone = "sanft";
  if (humorous && !heavyWeather) tone = "aktivierend";
  else if (!wantsSoft && !heavyWeather) tone = "neutral";

  // warmth
  const needsWarm = /(umarm|halten|anlehnen|geborgen|nähe)/i.test(text);
  const warmthLevel = needsWarm ? 3 : 2;

  // Mapping zu deinen UI-Indices
  // STYLES = ['Formell','Informell','Humorvoll']
  let styleIdx = 1;
  if (tone === "neutral") styleIdx = 0;
  if (tone === "aktivierend") styleIdx = 2;

  // BACKGROUNDS = ['Waldlicht','Dämmerung','Aurora']
  let bgIdx = 1;
  const natureWords = /(meer|wald|natur|see|strand|berge)/i;
  if (natureWords.test(a.safePlace) || natureWords.test(a.wishPlace)) bgIdx = 0;
  else if (!heavyWeather && /zukunft|space|stern|galax|neon|future/i.test(text)) bgIdx = 2;

  // MUSIC = ['Sanfte Piano-Wellen','Leichtes Lofi','Aurora Pads']
  let musicIdx = 2;
  if (heavyWeather || wantsSoft) musicIdx = 0; // beruhigend
  if (tone === "aktivierend" && brightWeather) musicIdx = 1; // verspielt

  const summary = `Ich habe verstanden, dass dir ${
    a.safePlace || "ein Gefühl von Sicherheit"
  } wichtig ist und dass sich Begleitung eher wie „${
    a.companionFeeling || "da sein"
  }“ anfühlen soll. Ich passe meine Stimme daran an – ruhig, achtsam und ohne Druck.`;

  return {
    tone,
    pacing,
    warmthLevel,
    summary,
    styleIdx,
    bgIdx,
    musicIdx,
  };
}

// --- Komponente --------------------------------------------------------------
export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState({
    name: "",
    age: "",
    weather: "",
    safePlace: "",
    companionFeeling: "",
    wishPlace: "",
    familiarFeeling: "",
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 500;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.innerWidth <= 500);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Wichtig: 10 Steps -> 0..9 (Startfrage + Begrüßung + 7 Fragen + Abschluss)
  const total = 10;
  const next = () => setStep((s) => Math.min(s + 1, total - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const profilePreview = analyzeAnswers(a);
  const done = () => {
    onComplete && onComplete({ answers: a, profile: profilePreview });
  };
  const skip = () => {
    onComplete && onComplete({ answers: a, profile: profilePreview, skipped: true });
  };
  const compactCardStyle = useMemo(
    () => (isMobile ? { ...cardStyle, padding: 12 } : cardStyle),
    [isMobile]
  );

  return (
    <div className="app onboardingScreen">
      {/* Step 0: Startfrage */}
      {step === 0 && (
        <div className="card" style={heroCardStyle}>
          <h2 style={headingStyle}>Ein kleiner Teddy‑Moment</h2>
          <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 12px" }}>
            <img
              src={QUESTION_TEDDY_SRC}
              alt="Teddy winkt"
              style={isMobile ? greetingImageMobileStyle : greetingImageStyle}
              loading="lazy"
            />
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.45, color: "#374151" }}>
            Coco legt schon mal sein Kuscheltier bereit und summt leise vor sich hin.
            Moechtest du ihm ein paar sanfte Stichwoerter geben, damit er sich auf dich einstimmen kann?
            Ganz ohne Eile und jederzeit ueberspringbar.
          </p>
          <div className="onboardingNav" style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={next} style={btnStyle}>
              Fragen beantworten
            </button>
            <button className="btn btnGhost" onClick={skip}>
              Überspringen
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Begrüßung */}
      {step === 1 && (
        <div className="card" style={heroCardStyle}>
          <h2 style={headingStyle}>Begrüßung</h2>
          {(() => {
            const heroLayout = isMobile
              ? { ...greetingHeroStyle, flexWrap: "nowrap", gap: 12, alignItems: "center" }
              : greetingHeroStyle
            const heroImgWrap = isMobile
              ? { ...greetingImageWrapperStyle, minWidth: 120, flex: "0 0 120px" }
              : greetingImageWrapperStyle
            const heroImgStyle = isMobile
              ? { ...greetingImageMobileStyle, width: 120 }
              : greetingImageStyle
            const heroTextStyle = isMobile
              ? { ...greetingTextColumnStyle, flex: "1 1 auto", minWidth: 0, textAlign: "left" }
              : greetingTextColumnStyle
            return (
              <div style={heroLayout}>
                <div style={heroImgWrap}>
                  <img
                    src={GREETING_PHOTO.src}
                    alt={GREETING_PHOTO.title}
                    style={heroImgStyle}
                    loading="lazy"
                  />
                </div>
                <div style={heroTextStyle}>
                  <span style={speechPointerStyle} aria-hidden="true" />
                  <p style={{ fontSize: 15, lineHeight: 1.45 }}>
                    Hallo… schön, dass du hier bist. Ich begleite dich jetzt in
                    Momenten, in denen du einfach du sein darfst – ohne Druck, ohne
                    Erwartungen. 🧸
                  </p>
                  <p style={{ marginTop: 6, color: "#374151", fontSize: 14, lineHeight: 1.4 }}>
                    Damit ich dich gut verstehen kann, stelle ich dir gleich ein paar
                    ganz kleine Fragen. Du brauchst nichts vorzubereiten – wähle
                    einfach, was sich richtig anfühlt.
                  </p>
                </div>
              </div>
            )
          })()}
          <button className="btn" onClick={next} style={btnStyle}>
            Los geht’s
          </button>
        </div>
      )}

      {/* Step 2: Name */}
      {step === 2 && (
        <div
          className="card"
          style={isMobile ? { ...compactCardStyle, background: "#f3edff" } : { ...cardStyle, background: "#f3edff" }}
        >
          <QuestionShell isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Wie heißt du?
            </label>
            <p style={helperStyle}>Damit dich Coco beim Namen ansprechen kann.</p>
            <input
              className="input"
              style={inputStyle}
              value={a.name}
              onChange={(e) => setA({ ...a, name: e.target.value })}
              placeholder="Mein Name ist…"
            />
            <button
              className="btn"
              onClick={next}
              disabled={!a.name.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 3: Alter */}
      {step === 3 && (
        <div className="card" style={compactCardStyle}>
          <QuestionShell isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Wie alt bist du?
            </label>
            <p style={helperStyle}>Hilft, passende Beispiele zu wählen.</p>
            <input
              className="input"
              style={inputStyle}
              type="number"
              value={a.age}
              onChange={(e) => setA({ ...a, age: e.target.value })}
              placeholder="Ich bin … Jahre alt"
            />
            <button
              className="btn"
              onClick={next}
              disabled={!a.age.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 4: Wetter */}
      {step === 4 && (
        <div className="card" style={compactCardStyle}>
          <QuestionShell isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Wenn dein heutiger Tag ein Wetter wäre – welches wäre es?
            </label>
            <p style={helperStyle}>Deine heutige Stimmung.</p>
            <input
              className="input"
              style={inputStyle}
              value={a.weather}
              onChange={(e) => setA({ ...a, weather: e.target.value })}
              placeholder="z. B. sonnig, bewölkt, regnerisch, stürmisch…"
            />
            <button
              className="btn"
              onClick={next}
              disabled={!a.weather.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 5: Safe Place */}
      {step === 5 && (
        <div className="card" style={compactCardStyle}>
          <QuestionShell variant="sit" isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Manchmal fühlt man sich an bestimmten Orten oder bei bestimmten
              Dingen besonders geborgen. Wenn du an ein solches Gefühl denkst –
              was fällt dir zuerst ein?
            </label>
            <p style={helperStyle}>Bestimmt deinen Safe-Space.</p>
            <textarea
              className="input"
              style={textAreaStyle}
              value={a.safePlace}
              onChange={(e) => setA({ ...a, safePlace: e.target.value })}
              placeholder="z. B. eine Decke, ein Zimmer, ein Geruch …"
              rows={3}
            />
            <button
              className="btn"
              onClick={next}
              disabled={!a.safePlace.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 6: Begleitungs-Gefühl */}
      {step === 6 && (
        <div className="card" style={compactCardStyle}>
          <QuestionShell isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Wenn du heute jemanden an deiner Seite hättest, wie sollte sich
              diese Person anfühlen?
            </label>
            <p style={helperStyle}>Legt deinen Sprachstil fest.</p>
            <input
              className="input"
              style={inputStyle}
              value={a.companionFeeling}
              onChange={(e) =>
                setA({ ...a, companionFeeling: e.target.value })
              }
              placeholder="z. B. ruhig, schützend, wärmend, einfach da, witzig …"
            />
            <button
              className="btn"
              onClick={next}
              disabled={!a.companionFeeling.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 7: Wunsch-Ort */}
      {step === 7 && (
        <div className="card" style={compactCardStyle}>
          <QuestionShell variant="sit" isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Wenn du dich jetzt an einen Ort wünschen könntest – wohin würdest
              du gern gehen?
            </label>
            <p style={helperStyle}>Wählt deine Lieblingsszene.</p>
            <input
              className="input"
              style={inputStyle}
              value={a.wishPlace}
              onChange={(e) => setA({ ...a, wishPlace: e.target.value })}
              placeholder="ans Meer… ins Bett… irgendwohin ohne Druck…"
            />
            <button
              className="btn"
              onClick={next}
              disabled={!a.wishPlace.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 8: Vertrautes Gefühl */}
      {step === 8 && (
        <div className="card" style={compactCardStyle}>
          <QuestionShell variant="sit" isMobile={isMobile}>
            <button className="onboardingBackLink" type="button" onClick={back}>
              &lt; Zurück
            </button>
            <label className="label" style={labelStyle}>
              Manchmal fühlt sich etwas ganz nah an – wie eine vertraute Melodie,
              eine Stimme oder etwas, das man schon lange kennt. Wenn du an so ein
              Gefühl denkst – was fällt dir ein?
            </label>
            <p style={helperStyle}>Entscheidet, ob Musik läuft.</p>
            <textarea
              className="input"
              style={textAreaStyle}
              value={a.familiarFeeling}
              onChange={(e) =>
                setA({ ...a, familiarFeeling: e.target.value })
              }
              placeholder="Das Erste, was dir einfällt…"
              rows={3}
            />
            <button
              className="btn"
              onClick={next}  // führt zu step === 9
              disabled={!a.familiarFeeling.trim()}
              style={btnStyle}
            >
              Weiter
            </button>
          </QuestionShell>
        </div>
      )}

      {/* Step 9: Abschluss */}
      {step === 9 && (
        <div className="card" style={compactCardStyle}>
          <button className="onboardingBackLink" type="button" onClick={back}>
            &lt; Zurück
          </button>
          <h3 style={headingStyle}>Danke, dass du das mit mir geteilt hast.</h3>
          <p>
            Ich habe jetzt ein Gefühl für dein Tempo, deine Farben – und das,
            was dir Geborgenheit gibt. Ich werde mich darauf einstellen – damit
            es sich hier für dich so anfühlt, wie mit einem guten Freund oder
            etwas, das du schon lange kennst. 🧸💫
          </p>
          <button className="btn" onClick={done} style={btnStyle}>
            Weiter in die App
          </button>
        </div>
      )}
    </div>
  );
}

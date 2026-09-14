import { useEffect, useRef, useState } from "react";
import {
  PALETTES,
  FONT_SIZES,
  loadPersonalization,
  savePersonalization,
  applyPersonalization,
} from "./personalizationStore";

// Wraps the business logo: hovering/focusing it reveals the personalization popover.
export default function PersonalizationMenu({ children }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPersonalization());
  const closeTimer = useRef(null);

  useEffect(() => {
    applyPersonalization(loadPersonalization());
  }, []);

  useEffect(() => {
    applyPersonalization(prefs);
    savePersonalization(prefs);
  }, [prefs]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function openNow() {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function closeSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }

  return (
    <div
      className="personalizationAnchor"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocus={openNow}
      onBlur={closeSoon}
    >
      {children}

      {open && (
        <div className="personalizationPanel" role="menu" aria-label="Personalización">
          <div className="personalizationTitle">Personalización</div>

          <div className="personalizationSection">
            <div className="personalizationLabel">Paleta de colores</div>
            <div className="personalizationSwatchRow">
              {PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  className={
                    "personalizationSwatch" +
                    (prefs.paletteId === palette.id ? " personalizationSwatchActive" : "")
                  }
                  title={palette.label}
                  onClick={() =>
                    setPrefs((prev) => ({ ...prev, paletteId: palette.id }))
                  }
                >
                  <span
                    className="personalizationSwatchColors"
                    style={{
                      background: `linear-gradient(135deg, ${palette.swatch[0]} 0 34%, ${palette.swatch[1]} 34% 67%, ${palette.swatch[2]} 67% 100%)`,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="personalizationSection">
            <div className="personalizationLabel">Tamaño de letra</div>
            <div className="personalizationOptionRow">
              {FONT_SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  className={
                    "personalizationOption" +
                    (prefs.fontSizeId === size.id ? " personalizationOptionActive" : "")
                  }
                  onClick={() =>
                    setPrefs((prev) => ({ ...prev, fontSizeId: size.id }))
                  }
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

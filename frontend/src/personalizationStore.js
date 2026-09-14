// Persists user-facing UI personalization (palette, text size) in localStorage.
const STORAGE_KEY = "pos_personalization_v1";

export const PALETTES = [
  {
    id: "sabor-latino",
    label: "Sabor Latino",
    swatch: ["#CD0508", "#B05328", "#FEAE0D"],
    vars: {
      "--bg": "#F5F5F5",
      "--panel": "rgba(255,255,255,.92)",
      "--panel2": "rgba(255,251,245,.90)",
      "--border": "rgba(26,8,0,.14)",
      "--text": "#1a0800",
      "--muted": "rgba(26,8,0,.58)",
      "--shadow": "0 6px 28px rgba(0,0,0,.10)",
      "--surface-base": "#FFFFFF",
      "--glow-1": "rgba(254,174,13,.18)",
      "--glow-2": "rgba(176,83,40,.14)",
      "--glow-3": "rgba(205,5,8,.12)",
      "--red": "#CD0508",
      "--red2": "rgba(205,5,8,.24)",
      "--brown": "#B05328",
      "--brown2": "rgba(176,83,40,.24)",
      "--amber": "#FEAE0D",
      "--amber2": "rgba(254,174,13,.28)",
      "--accent": "#FEAE0D",
      "--accent2": "rgba(254,174,13,.30)",
    },
  },
  {
    id: "oceano",
    label: "Océano",
    swatch: ["#0B5FA5", "#0E7C86", "#0FB5D6"],
    vars: {
      "--bg": "#EFF6FA",
      "--panel": "rgba(255,255,255,.92)",
      "--panel2": "rgba(236,248,250,.90)",
      "--border": "rgba(6,38,54,.16)",
      "--text": "#062634",
      "--muted": "rgba(6,38,52,.62)",
      "--shadow": "0 6px 28px rgba(0,26,38,.14)",
      "--surface-base": "#FFFFFF",
      "--glow-1": "rgba(15,181,214,.20)",
      "--glow-2": "rgba(14,124,134,.16)",
      "--glow-3": "rgba(11,95,165,.14)",
      "--red": "#0B5FA5",
      "--red2": "rgba(11,95,165,.26)",
      "--brown": "#0E7C86",
      "--brown2": "rgba(14,124,134,.26)",
      "--amber": "#0FB5D6",
      "--amber2": "rgba(15,181,214,.30)",
      "--accent": "#0FB5D6",
      "--accent2": "rgba(15,181,214,.32)",
    },
  },
  {
    id: "bosque",
    label: "Bosque",
    swatch: ["#1B4332", "#40916C", "#95D5B2"],
    vars: {
      "--bg": "#F1F8F3",
      "--panel": "rgba(255,255,255,.92)",
      "--panel2": "rgba(240,250,243,.90)",
      "--border": "rgba(10,36,22,.16)",
      "--text": "#0C2A18",
      "--muted": "rgba(12,42,24,.62)",
      "--shadow": "0 6px 28px rgba(6,26,16,.14)",
      "--surface-base": "#FFFFFF",
      "--glow-1": "rgba(149,213,178,.24)",
      "--glow-2": "rgba(64,145,108,.16)",
      "--glow-3": "rgba(27,67,50,.12)",
      "--red": "#1B4332",
      "--red2": "rgba(27,67,50,.26)",
      "--brown": "#40916C",
      "--brown2": "rgba(64,145,108,.26)",
      "--amber": "#95D5B2",
      "--amber2": "rgba(149,213,178,.34)",
      "--accent": "#95D5B2",
      "--accent2": "rgba(149,213,178,.36)",
    },
  },
  {
    id: "real",
    label: "Púrpura Real",
    swatch: ["#5A189A", "#9D4EDD", "#E5A400"],
    vars: {
      "--bg": "#F7F2FB",
      "--panel": "rgba(255,255,255,.92)",
      "--panel2": "rgba(249,244,253,.90)",
      "--border": "rgba(40,10,60,.16)",
      "--text": "#230738",
      "--muted": "rgba(35,7,56,.62)",
      "--shadow": "0 6px 28px rgba(30,4,48,.16)",
      "--surface-base": "#FFFFFF",
      "--glow-1": "rgba(229,164,0,.18)",
      "--glow-2": "rgba(157,78,221,.18)",
      "--glow-3": "rgba(90,24,154,.14)",
      "--red": "#5A189A",
      "--red2": "rgba(90,24,154,.26)",
      "--brown": "#9D4EDD",
      "--brown2": "rgba(157,78,221,.26)",
      "--amber": "#E5A400",
      "--amber2": "rgba(229,164,0,.32)",
      "--accent": "#E5A400",
      "--accent2": "rgba(229,164,0,.34)",
    },
  },
  {
    id: "pizarra",
    label: "Pizarra Oscura",
    swatch: ["#FF6B6B", "#4ECDC4", "#FFD166"],
    vars: {
      "--bg": "#0B1420",
      "--panel": "rgba(30,41,59,.88)",
      "--panel2": "rgba(51,65,85,.55)",
      "--border": "rgba(255,255,255,.18)",
      "--text": "#F1F5F9",
      "--muted": "rgba(241,245,249,.66)",
      "--shadow": "0 10px 32px rgba(0,0,0,.55)",
      "--surface-base": "#3B4B63",
      "--glow-1": "rgba(255,209,102,.12)",
      "--glow-2": "rgba(78,205,196,.10)",
      "--glow-3": "rgba(255,107,107,.10)",
      "--red": "#FF6B6B",
      "--red2": "rgba(255,107,107,.30)",
      "--brown": "#4ECDC4",
      "--brown2": "rgba(78,205,196,.28)",
      "--amber": "#FFD166",
      "--amber2": "rgba(255,209,102,.34)",
      "--accent": "#FFD166",
      "--accent2": "rgba(255,209,102,.36)",
    },
  },
];

export const FONT_SIZES = [
  { id: "small", label: "Pequeña", scale: 0.9 },
  { id: "normal", label: "Normal", scale: 1 },
  { id: "large", label: "Grande", scale: 1.12 },
  { id: "xlarge", label: "Muy grande", scale: 1.25 },
];

const DEFAULTS = {
  paletteId: PALETTES[0].id,
  fontSizeId: "normal",
};

export function loadPersonalization() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      paletteId: PALETTES.some((p) => p.id === parsed.paletteId) ? parsed.paletteId : DEFAULTS.paletteId,
      fontSizeId: FONT_SIZES.some((f) => f.id === parsed.fontSizeId) ? parsed.fontSizeId : DEFAULTS.fontSizeId,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePersonalization(prefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage indisponible (modo privado, cuota llena, etc.): se ignora.
  }
}

export function applyPersonalization(prefs) {
  const root = document.documentElement;
  const palette = PALETTES.find((p) => p.id === prefs.paletteId) || PALETTES[0];
  const fontSize = FONT_SIZES.find((f) => f.id === prefs.fontSizeId) || FONT_SIZES[1];

  Object.entries(palette.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.style.fontSize = `${16 * fontSize.scale}px`;
}

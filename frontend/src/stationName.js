const DEFAULT_NAMES = {
  restaurante: { singular: "Mesa", plural: "Mesas" },
  taller_motos: { singular: "Estación", plural: "Estaciones" },
};

let activeConfiguration = null;

export function setStationConfiguration(config) {
  activeConfiguration = config;
}

export function getStationLabels(config = activeConfiguration) {
  const defaults = DEFAULT_NAMES[config?.tipo_negocio] || DEFAULT_NAMES.restaurante;
  const singular = String(config?.nombre_estacion_singular || "").trim();
  const plural = String(config?.nombre_estacion_plural || "").trim();
  return {
    singular: singular || defaults.singular,
    plural: plural || defaults.plural,
  };
}

export function formatStationName(name, number = null) {
  const { singular } = getStationLabels();
  const fallback = Number(number) > 0 ? `${singular} ${number}` : "";
  const label = String(name || "").trim() || fallback;
  return label.replace(/^(?:mesa|estaci[oó]n)\b/i, () => singular);
}

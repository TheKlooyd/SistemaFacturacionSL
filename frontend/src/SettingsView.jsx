import { useEffect, useState } from "react";
import {
  applyPersonalization,
  FONT_SIZES,
  loadPersonalization,
  PALETTES,
  savePersonalization,
} from "./personalizationStore";
import { requireNegocioId, getActiveTenant, updateActiveTenantConfiguration } from "./tenantSession";
import { supabase } from "./supabaseClient";
import { getStationLabels } from "./stationName";

export default function SettingsView({
  onBack,
  tables,
  loadingTables,
  addingTable,
  maxTables,
  onAddTable,
}) {
  const tenant = getActiveTenant();
  const [prefs, setPrefs] = useState(loadPersonalization);
  const [stationLabels, setStationLabels] = useState(() =>
    getStationLabels(tenant?.configuracion)
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [tableFeedback, setTableFeedback] = useState(null);
  const canEditStations = ["propietario", "administrador"].includes(
    tenant?.membership?.rol
  );
  const businessType =
    tenant?.configuracion?.tipo_negocio === "taller_motos"
      ? "Taller de motos"
      : "Restaurante";

  useEffect(() => {
    applyPersonalization(prefs);
    savePersonalization(prefs);
  }, [prefs]);

  function updatePreferences(patch) {
    setPrefs((current) => ({ ...current, ...patch }));
  }

  async function addStation() {
    if (loadingTables || addingTable || tables.length >= maxTables) return;

    setTableFeedback(null);
    try {
      const added = await onAddTable();
      if (!added) {
        throw new Error(`No se pudo agregar ${stationLabels.singular.toLowerCase()}.`);
      }

      setTableFeedback({
        type: "success",
        message: "Se agregó correctamente.",
      });
    } catch (error) {
      setTableFeedback({
        type: "error",
        message: error?.message || `No se pudo agregar ${stationLabels.singular.toLowerCase()}.`,
      });
    }
  }

  async function saveStationLabels(event) {
    event.preventDefault();
    if (!canEditStations || saving) return;

    const singular = stationLabels.singular.trim();
    const plural = stationLabels.plural.trim();
    if (!singular || !plural) {
      setFeedback({ type: "error", message: "Escribe el nombre singular y plural." });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase
        .from("negocio_configuracion")
        .update({
          nombre_estacion_singular: singular,
          nombre_estacion_plural: plural,
        })
        .eq("negocio_id", requireNegocioId())
        .select("tipo_negocio,nombre_estacion_singular,nombre_estacion_plural")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("No se pudo guardar la configuración del negocio.");

      updateActiveTenantConfiguration(data);
      setStationLabels({ singular, plural });
      setFeedback({ type: "success", message: "Nombres guardados." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo guardar la configuración.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Configuración</h1>
        <div className="topbarActions">
          <button type="button" className="btn" onClick={onBack}>
            Volver
          </button>
        </div>
      </header>

      <div className="settingsLayout">
        <section className="card settingsCard">
          <div className="panelTitle">Personalización</div>

          <div className="settingsSection">
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
                  aria-label={`Usar paleta ${palette.label}`}
                  aria-pressed={prefs.paletteId === palette.id}
                  onClick={() => updatePreferences({ paletteId: palette.id })}
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

          <div className="settingsSection">
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
                  aria-pressed={prefs.fontSizeId === size.id}
                  onClick={() => updatePreferences({ fontSizeId: size.id })}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card settingsCard">
          <div className="panelTitle">Administrar {stationLabels.plural.toLowerCase()}</div>
          <p className="settingsDescription">
            Agrega hasta {maxTables} {stationLabels.plural.toLowerCase()}. Las adicionales quedan disponibles en el POS, pero no generan un QR automáticamente.
          </p>
          <p className="settingsDescription" aria-live="polite">
            {loadingTables
              ? `Cargando ${stationLabels.plural.toLowerCase()}...`
              : `${tables.length} de ${maxTables} ${stationLabels.plural.toLowerCase()}`}
          </p>
          {tables.length >= maxTables && !loadingTables && (
            <p className="settingsNotice">
              Se alcanzó el límite de {maxTables} {stationLabels.plural.toLowerCase()}.
            </p>
          )}
          {tableFeedback && (
            <p className={`settingsFeedback ${tableFeedback.type}`} role="status">
              {tableFeedback.message}
            </p>
          )}
          <button
            type="button"
            className="btnPrimary"
            onClick={() => void addStation()}
            disabled={loadingTables || addingTable || tables.length >= maxTables}
          >
            {addingTable
              ? `Agregando ${stationLabels.singular.toLowerCase()}...`
              : `Agregar ${stationLabels.singular.toLowerCase()}`}
          </button>
        </section>

        <section className="card settingsCard">
          <div className="panelTitle">Nombres de {stationLabels.plural.toLowerCase()}</div>
          <p className="settingsDescription">
            Tipo de negocio: <strong>{businessType}</strong>. Personaliza cómo se nombran en las pantallas y tickets.
          </p>

          {!canEditStations && (
            <p className="settingsNotice">
              Solo el propietario o un administrador puede cambiar estos nombres.
            </p>
          )}

          <form className="settingsStationForm" onSubmit={saveStationLabels}>
            <label className="settingsField">
              <span>Nombre en singular</span>
              <input
                className="input"
                value={stationLabels.singular}
                onChange={(event) =>
                  setStationLabels((current) => ({
                    ...current,
                    singular: event.target.value,
                  }))
                }
                maxLength={40}
                required
                disabled={!canEditStations || saving}
              />
            </label>

            <label className="settingsField">
              <span>Nombre en plural</span>
              <input
                className="input"
                value={stationLabels.plural}
                onChange={(event) =>
                  setStationLabels((current) => ({
                    ...current,
                    plural: event.target.value,
                  }))
                }
                maxLength={40}
                required
                disabled={!canEditStations || saving}
              />
            </label>

            {feedback && (
              <p className={`settingsFeedback ${feedback.type}`} role="status">
                {feedback.message}
              </p>
            )}

            {canEditStations && (
              <button type="submit" className="btnPrimary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar nombres"}
              </button>
            )}
          </form>
        </section>
      </div>
    </>
  );
}

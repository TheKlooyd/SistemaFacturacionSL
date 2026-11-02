// One message per calendar day, shared across sessions in the business timezone.
export const DAILY_MESSAGES = [
  "Mucho trabajo? menos mal, esa es la idea.",
  "Todo es posible si te esfuerzas lo suficiente, yo por lo menos no tenía idea de como hacer este sistema, pero aquí estamos.",
  "Revisa si hay ofertas en linea, aveces uno se pierde de los mejores gangazos.",
  "No se me ocurrió una frase para el día de hoy, que tengas buen dia :P",
  "Solo no hay solución para la muerte, para todo lo demás: hay solución. La vida es bella.",
  "Recuerda barrer detras de la puerta.",
  "8 litros de agua al día mantienen lejos al doctor. ¿O eran 8 vasos? no se, mira en internet.",
  "Si te llama alguien a pedir datos de tu tarjeta de credito no se los des.",
  "Por cada taza de arroz son dos de agua.",
  "Nunca está demas tener un taladro en casa.",
  "Si presentas alguna falla con el sistema este es mi numero de whatsapp: 3215282294",
  "El internet LAN es mucho mas rápido que el WIFI",
  "Si refieres a un amigo a usar nuestro sistema obtienes hasta un 50% de descuento en tu mensualidad :D",
  "Pones el clutch, metes primera y sueltas el clutch despacio.",
  "En la regla de tres hay que igualar fracciones para saber cual es el resultado de X.",
  "Que tengas buen dia y muchas ventas :)",
];

const ROTATION_START = Date.UTC(2026, 10, 2);
const DAY_MS = 86_400_000;

export function getDailyMessage(now = Date.now(), timeZone = "America/Bogota") {
  const date = new Date(now);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date).map(({ type, value }) => [type, value])
  );
  const dayOffset = Math.floor(
    (Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - ROTATION_START) / DAY_MS
  );
  const index = ((dayOffset % DAILY_MESSAGES.length) + DAILY_MESSAGES.length) % DAILY_MESSAGES.length;
  const formattedDate = new Intl.DateTimeFormat("es-CO", {
    timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(date);

  return {
    message: DAILY_MESSAGES[index],
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    formattedDate: formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1),
  };
}

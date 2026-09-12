import { supabase } from "./supabaseClient";
import { requireNegocioId } from "./tenantSession";

const CHANNEL_PREFIX = "mobile-order-notifications";
const EVENT_NAME = "new_mobile_order";
const TAB_ID = crypto.randomUUID();

let channel = null;
let channelNegocioId = null;

function getChannel() {
  const negocioId = requireNegocioId();

  if (channel && channelNegocioId !== negocioId) {
    void supabase.removeChannel(channel);
    channel = null;
    channelNegocioId = null;
  }

  if (!channel) {
    channelNegocioId = negocioId;
    channel = supabase.channel(`${CHANNEL_PREFIX}:${negocioId}`);
  }

  return channel;
}

export function broadcastMobileOrder({ tableId, tableName, createdAt, items }) {
  getChannel().send({
    type: "broadcast",
    event: EVENT_NAME,
    payload: {
      sourceId: TAB_ID,
      tableId,
      tableName,
      createdAt,
      items,
    },
  });
}

export function subscribeToMobileOrders(onNotify) {
  const ch = getChannel();

  ch.on("broadcast", { event: EVENT_NAME }, ({ payload }) => {
    if (payload.sourceId === TAB_ID) return;
    onNotify(payload);
  });

  ch.subscribe();

  return () => {
    void supabase.removeChannel(ch);

    if (channel === ch) {
      channel = null;
      channelNegocioId = null;
    }
  };
}

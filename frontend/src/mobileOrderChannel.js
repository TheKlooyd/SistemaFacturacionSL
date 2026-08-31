import { supabase } from "./supabaseClient";

const CHANNEL_NAME = "mobile-order-notifications";
const EVENT_NAME = "new_mobile_order";
// Unique per browser tab so a device doesn't pop up its own notification.
const TAB_ID = crypto.randomUUID();

let channel = null;

function getChannel() {
  if (!channel) {
    channel = supabase.channel(CHANNEL_NAME);
  }
  return channel;
}

/** Broadcasts to every open instance of the app that a mobile order was registered. */
export function broadcastMobileOrder({ tableId, tableName, createdAt, items }) {
  getChannel().send({
    type: "broadcast",
    event: EVENT_NAME,
    payload: { sourceId: TAB_ID, tableId, tableName, createdAt, items },
  });
}

/** Subscribes to mobile order broadcasts from other tabs/devices. Returns an unsubscribe function. */
export function subscribeToMobileOrders(onNotify) {
  const ch = getChannel();
  ch.on("broadcast", { event: EVENT_NAME }, ({ payload }) => {
    if (payload.sourceId === TAB_ID) return; // ignore our own broadcast
    onNotify(payload);
  });
  ch.subscribe();

  return () => {
    supabase.removeChannel(ch);
    channel = null;
  };
}

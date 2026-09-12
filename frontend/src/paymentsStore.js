import { supabase } from "./supabaseClient";
import { requireNegocioId } from "./tenantSession";

export async function loadPayments() {
  const negocioId = requireNegocioId();

  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .eq("negocio_id", negocioId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "loadPayments error:",
      error
    );
    return [];
  }

  return (data || []).map((p) => ({
    id: p.id,
    createdAt: p.created_at,
    tableId: p.table_id,
    tableName: p.table_name,
    isDelivery: p.is_delivery,
    deliveryClient: p.delivery_client,
    method: p.method,
    paymentSplits: p.payment_splits,
    subtotal: p.subtotal,
    tipAmount: p.tip_amount,
    discountAmount:
      p.discount_amount || 0,
    totalWithTip:
      p.total_with_tip,
    paidAmount: p.paid_amount,
    items: p.items,
  }));
}

export async function addPayment(payment) {
  const negocioId = requireNegocioId();

  const payload = {
    id:
      payment.id ||
      crypto.randomUUID(),
    negocio_id: negocioId,
    table_id: payment.tableId,
    table_name: payment.tableName,
    is_delivery:
      payment.isDelivery || false,
    delivery_client:
      payment.deliveryClient || null,
    method: payment.method || null,
    payment_splits:
      payment.paymentSplits || null,
    subtotal: payment.subtotal,
    tip_amount: payment.tipAmount,
    discount_amount:
      payment.discountAmount || 0,
    total_with_tip:
      payment.totalWithTip,
    paid_amount:
      payment.paidAmount,
    items: payment.items,
    created_at:
      payment.createdAt ||
      new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("pagos")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error(
      "addPayment error:",
      error
    );
    throw error;
  }

  return data;
}

export async function completePaymentAndCloseOrder(
  payment
) {
  const negocioId = requireNegocioId();

  const payload = {
    id:
      payment.id ||
      crypto.randomUUID(),
    negocio_id: negocioId,
    table_id:
      String(payment.tableId),
    table_name: payment.tableName,
    is_delivery:
      payment.isDelivery || false,
    delivery_client:
      payment.deliveryClient || null,
    method: payment.method || null,
    payment_splits:
      payment.paymentSplits || null,
    subtotal: payment.subtotal,
    tip_amount: payment.tipAmount,
    discount_amount:
      payment.discountAmount || 0,
    total_with_tip:
      payment.totalWithTip,
    paid_amount:
      payment.paidAmount,
    items: payment.items || [],
    created_at:
      payment.createdAt ||
      new Date().toISOString(),
  };

  const { data, error } =
    await supabase.rpc(
      "complete_table_payment",
      {
        p_payment: payload,
      }
    );

  if (error) {
    console.error(
      "completePaymentAndCloseOrder error:",
      error
    );
    throw error;
  }

  return data;
}

export async function updatePayment(
  id,
  changes
) {
  const negocioId = requireNegocioId();

  const payload = {};

  if (changes.items !== undefined) {
    payload.items = changes.items;
  }

  if (changes.subtotal !== undefined) {
    payload.subtotal = changes.subtotal;
  }

  if (
    changes.total_with_tip !== undefined
  ) {
    payload.total_with_tip =
      changes.total_with_tip;
  }

  const { error } = await supabase
    .from("pagos")
    .update(payload)
    .eq("id", id)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error(
      "updatePayment error:",
      error
    );
  }
}

export async function deletePayment(id) {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("pagos")
    .delete()
    .eq("id", id)
    .eq("negocio_id", negocioId);

  if (error) {
    console.error(
      "deletePayment error:",
      error
    );
  }
}

export async function clearPayments() {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("pagos")
    .delete()
    .eq("negocio_id", negocioId)
    .gte("created_at", "2020-01-01");

  if (error) {
    console.error(
      "clearPayments error:",
      error
    );
  }
}

export async function saveDailyClose(
  closeObj
) {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("cierres_diarios")
    .upsert(
      {
        negocio_id: negocioId,
        date_iso: closeObj.dateISO,
        data: closeObj,
        created_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "negocio_id,date_iso",
      }
    );

  if (error) {
    console.error(
      "saveDailyClose error:",
      error
    );
  }
}

export async function loadDailyClose(
  dateISO
) {
  const negocioId = requireNegocioId();

  let query = supabase
    .from("cierres_diarios")
    .select("*")
    .eq("negocio_id", negocioId)
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (dateISO) {
    query = supabase
      .from("cierres_diarios")
      .select("*")
      .eq("negocio_id", negocioId)
      .eq("date_iso", dateISO)
      .maybeSingle();
  }

  const { data, error } = await query;

  if (error || !data) {
    return null;
  }

  return data.data;
}

export async function deleteDailyClose() {
  const negocioId = requireNegocioId();

  const { error } = await supabase
    .from("cierres_diarios")
    .delete()
    .eq("negocio_id", negocioId)
    .gte("created_at", "2020-01-01");

  if (error) {
    console.error(
      "deleteDailyClose error:",
      error
    );
  }
}
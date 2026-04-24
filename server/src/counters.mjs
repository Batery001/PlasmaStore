/**
 * IDs numéricos en Mongo (mismo contrato que el front: productId / userId enteros).
 */
export async function nextSeq(db, name) {
  const col = db.collection("counters");
  const r = await col.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  const v = r.value?.seq;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`No se pudo obtener seq para ${name}`);
  return v;
}

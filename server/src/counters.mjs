/**
 * IDs numéricos en Mongo (mismo contrato que el front: productId / userId enteros).
 */
export async function nextSeq(db, name) {
  const col = db.collection("counters");
  const r = await col.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  // Según versión de driver/typing, `findOneAndUpdate` puede retornar:
  // - { value: { _id, seq } }  (forma clásica)
  // - { _id, seq }             (forma “document-only”)
  const raw = r?.value?.seq ?? r?.seq;
  const v =
    typeof raw === "number"
      ? raw
      : raw && typeof raw === "object" && typeof raw.toNumber === "function"
        ? raw.toNumber()
        : NaN;
  if (!Number.isFinite(v)) throw new Error(`No se pudo obtener seq para ${name}`);
  return v;
}

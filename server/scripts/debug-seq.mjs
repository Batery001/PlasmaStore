import { loadProjectEnv } from "../src/loadProjectEnv.mjs";
loadProjectEnv(process.cwd());

import { getDb } from "../src/mongo.mjs";

const db = await getDb();
const r = await db
  .collection("counters")
  .findOneAndUpdate({ _id: "tag" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });

// eslint-disable-next-line no-console
console.log(JSON.stringify(r, null, 2));
// eslint-disable-next-line no-console
console.log("seq=", r.value?.seq, "type=", typeof r.value?.seq, "ctor=", r.value?.seq?.constructor?.name);


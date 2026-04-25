import { loadProjectEnv } from "../src/loadProjectEnv.mjs";
loadProjectEnv(process.cwd());

import { getDb } from "../src/mongo.mjs";
import { nextSeq } from "../src/counters.mjs";

const db = await getDb();
// eslint-disable-next-line no-console
console.log("next tag:", await nextSeq(db, "tag"));
// eslint-disable-next-line no-console
console.log("next product:", await nextSeq(db, "product"));


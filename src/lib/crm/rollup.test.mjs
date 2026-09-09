// Smallest thing that fails if the roll-ups break. Run: node src/lib/crm/rollup.test.mjs
// (plain .mjs with a tsx-free inline copy of the logic would drift, so this imports the
// real module through Node's type stripping — Node 22.6+ / 24.)
import assert from "node:assert/strict";
import { rollUpClusters, rollUpVillaTypes } from "./rollup.ts";

const u = (id, cluster, villaType, status) => ({ id, projectId: "p", cluster, villaType, status });
const units = [
  u("a-1", "Sea Vil", "sea-a", "available"),
  u("a-2", "Sea Vil", "sea-a", "sold"),
  u("b-1", "Sea Vil", "sea-b", "available"),
  u("c-1", "Isle Vil", "isle-c", "reserved"),
  u("d-1", "Isle Vil", undefined, "available"), // org without the field
];

const clusters = rollUpClusters(units);
assert.deepEqual(clusters.find((c) => c.cluster === "Sea Vil"), { cluster: "Sea Vil", total: 3, available: 2 });
assert.deepEqual(clusters.find((c) => c.cluster === "Isle Vil"), { cluster: "Isle Vil", total: 2, available: 1 });

const types = rollUpVillaTypes(units);
assert.equal(types.length, 3, "units with no villaType must not create a phantom bucket");
assert.deepEqual(types.find((t) => t.villaType === "sea-a"), {
  villaType: "sea-a", cluster: "Sea Vil", total: 2, available: 1, availableUnitIds: ["a-1"],
});
assert.deepEqual(types.find((t) => t.villaType === "isle-c").availableUnitIds, [],
  "reserved units must not be offered for enquiry");

console.log("rollup: ok");

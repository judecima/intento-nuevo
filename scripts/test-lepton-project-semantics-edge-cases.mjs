#!/usr/bin/env node

import assert from "node:assert/strict";
import { auditLeptonProjectXml } from "./lib/lepton-project-semantics.mjs";

const emptyBoard = `<?xml version="1.0"?>
<project>
  <panel1 l="100" w="100" material="X" thickness="18" saw="4.5" num="1">
    <no.1 l="100" w="100" trim="5" x="0" y="0" layer="1" id="0">
      <part cut="40" num="1" type="2" id="1" code="" />
    </no.1>
    <no.2 l="100" w="40" trim="5" x="0" y="0" layer="2" id="1"></no.2>
  </panel1>
</project>`;

const emptyAudit = auditLeptonProjectXml(emptyBoard);
assert.equal(emptyAudit.trimRuleCandidates.factoryEdgeOrReserve.pass, true);
assert.equal(
  emptyAudit.trimRuleCandidates.factoryEdgeOrReserve.notApplicablePhysicalBoards,
  1,
);
assert.equal(
  emptyAudit.trimRuleCandidates.factoryEdgeOrReserve.violatingPhysicalBoards,
  0,
);

const missingTerminal = `<?xml version="1.0"?>
<project>
  <panel1 l="100" w="100" material="X" thickness="18" saw="4.5" num="1">
    <no.1 l="100" w="100" trim="5" x="0" y="0" layer="1" id="0">
      <part cut="98" num="1" type="1" id="1" code="A" />
    </no.1>
  </panel1>
</project>`;

assert.throws(
  () => auditLeptonProjectXml(missingTerminal),
  /terminal references missing child nodes: 1/,
);

const partialMargin = `<?xml version="1.0"?>
<project>
  <panel1 l="100" w="100" material="X" thickness="18" saw="4.5" num="1">
    <no.1 l="100" w="100" trim="5" x="0" y="0" layer="1" id="0">
      <part cut="98" num="1" type="1" id="1" code="A" />
    </no.1>
    <no.2 l="98" w="100" trim="5" x="0" y="0" layer="2" id="1"></no.2>
  </panel1>
</project>`;

const partialAudit = auditLeptonProjectXml(partialMargin);
assert.equal(partialAudit.trimRuleCandidates.factoryEdgeOrReserve.pass, false);
assert.equal(
  partialAudit.trimRuleCandidates.factoryEdgeOrReserve.violatingPhysicalBoards,
  1,
);

console.log("LEPTON_PROJECT_SEMANTICS_EDGE_CASES_OK");

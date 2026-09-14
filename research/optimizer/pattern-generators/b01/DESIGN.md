# B0.1: incremental scheduling under the H4 budget

Before implementation/measurement, 2026-09-14.

Only 4057401 is authorized. Keep H4's 20,000 expansions, 50,000 AND pairs,
10,000 live entries, 500 materializations and K=8. Kernel and frozen B0 remain
unchanged. Minimum gate: nonempty physically valid pool, actual materializations,
and deterministic repetition. Quality target: A's four boards, with no worse
official remnant quality at equal boards. A's known XML label defect stays open.

Use deterministic round-robin between root-origin lanes X/Y and between state
advancement and propagation. A state step admits at most one expansion; an AND
step admits one pair, including failed/duplicate work. Coordinate setup/proposals
use the same linear stream merge and same coordinate set, made suspendable.
Each accepted child alternative can trigger a parent join before either child
is complete. Live shared-state lookup is not complete-state caching. Only global
quiescence can certify this initial implementation's states complete.

Index exact piece orientations by width/height and terminal candidates by the
fixed dimension, filtering the perpendicular extent exactly. Building the index,
queries and matching alternatives consume expansions. No new heuristic pruning,
dominance, structural hashes or pair filtering. Existing K and pool ordering stay.
Terminal alternatives keep B0's bypass of the ordinary child's K frontier.

Pending delta descriptors and terminal alternatives occupy ledger slots as well
as the ordinary frontier. Pending partner lists carry existing numeric node IDs,
not unaccounted descriptor snapshots. Pairs referencing K-evicted partners are
still charged. Already propagated parents stay valid independently of child
replacement. No AND work is allowed after stopping; only retained complete root
descriptors may be materialized afterward.

Validate unbounded tiny cases against the independent oracle, physical/XML output,
interruption semantics, exact candidate indices, fairness and work accounting.
Record first root discovery and first successfully materialized retained root's
discovery expansion, final retained root/usage counts and expansions by work kind,
root-origin lane and physical axis. Preserve all real attempts and their hashes.

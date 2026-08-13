Run condition, recorded 2026-08-11 during the spike:
Bitdefender blocked outbound access to an api.frappe* endpoint during runs 1 and 2
(harness 0.1.0). The exception was added mid-spike, so runs 3 and 4 (harness 0.1.1)
executed with that host reachable. @frappe-inspector/mcp is therefore probed under
different network conditions across the two harness versions. Expect a possible status
or tool-count difference on that one server between the 0.1.0 pair and the 0.1.1 pair;
it is an environment change, not instrument noise. Within each pair the condition was
constant, so neither reproducibility verdict is affected.

Generalises to: local endpoint-protection software is an uncontrolled input to this
measurement. Another reason the scaled version belongs in a container with declared
egress rather than on a workstation.

---

Second recorded condition, same day:

Two sweeps were run concurrently on this workstation (a full cohort sweep and a targeted
five-server re-test). Sandbox directories are keyed by server name, not by run, so both
processes installed into and deleted the same directory for the two servers that appeared in
both sets. Result: `EPERM` and two `harness_error` records in the second run for
`infimium` and `grasp-mcp-server`.

Self-inflicted, fully explained, and not a property of either server. The fix is a run lock
that refuses to start a second concurrent sweep — cheaper and safer than per-run sandbox paths,
because concurrent sweeps also contend for CPU and network and have no reason to exist.

Filed as harness 0.1.2. It touches no measured quantity.

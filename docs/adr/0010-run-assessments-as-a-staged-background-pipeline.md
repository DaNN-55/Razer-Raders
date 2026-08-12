# Run assessments as a staged background pipeline

Razer-Raders will produce Brief Snapshots through a deterministic Assessment Pipeline executed by one separate Task Worker per instance, rather than through Web requests or an autonomous one-shot agent. Language models perform bounded structured tasks within that pipeline; unavailable configured runtimes cause visible assessment delays, not implicit model substitution.

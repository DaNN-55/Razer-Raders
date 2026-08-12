# Use PostgreSQL for the Radar Archive

Razer-Raders will run PostgreSQL from its first Docker Compose deployment to store the permanent Radar Archive, evidence, metric snapshots, configuration versions, and task history. The additional service keeps the Web application and background worker reliably concurrent and avoids a later archive migration.

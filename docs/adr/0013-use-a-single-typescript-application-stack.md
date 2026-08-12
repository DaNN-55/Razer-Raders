# Use a single TypeScript application stack

Razer-Raders will use TypeScript throughout: Next.js for the Web Service and configuration API, and a Node.js Task Worker for the Assessment Pipeline, with PostgreSQL orchestrated by Docker Compose. This keeps shared Connector and assessment types in one maintainable codebase for self-hosters.

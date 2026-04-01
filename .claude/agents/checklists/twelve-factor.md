# Twelve-Factor App Checklist

## I. Codebase

- [ ] One codebase is tracked in version control; multiple deploys come from the same repo
- [ ] There is a 1:1 mapping between the codebase and the app -- shared code is extracted into libraries
- [ ] All environments (dev, staging, production) deploy from the same codebase with different configs

## II. Dependencies

- [ ] All dependencies are explicitly declared in a manifest (package.json, requirements.txt, go.mod)
- [ ] A lockfile pins exact dependency versions for reproducible builds
- [ ] The app does not rely on system-wide packages; everything is isolated (virtualenv, node_modules)
- [ ] Dependency installation is a single command that works on a fresh checkout

## III. Config

- [ ] Environment-specific config (DB URLs, API keys, feature flags) is stored in environment variables
- [ ] No credentials, secrets, or environment-specific values are committed to the repository
- [ ] Config can be changed between deploys without code changes or rebuilds
- [ ] Config is strictly separated from code -- a test: could the repo be open-sourced without exposing secrets?

## IV. Backing Services

- [ ] Databases, caches, queues, email services, and storage are treated as attached resources
- [ ] Backing services are accessed via URLs or connection strings from config, not hardcoded addresses
- [ ] Swapping a local database for a managed service requires only a config change, no code change
- [ ] The app makes no distinction between local and third-party backing services

## V. Build, Release, Run

- [ ] Build, release, and run stages are strictly separated
- [ ] Builds produce a deployable artifact from the codebase plus dependencies
- [ ] Releases combine the build artifact with environment config and have a unique ID (timestamp or version)
- [ ] Running code is never modified directly in production; changes go through the full pipeline

## VI. Processes

- [ ] The app runs as one or more stateless processes
- [ ] No in-memory state is shared between requests or assumed to persist across restarts
- [ ] Session data is stored in a backing service (Redis, database), not in process memory
- [ ] File uploads and generated files use object storage, not the local filesystem
- [ ] Processes can be started, stopped, and restarted without data loss

## VII. Port Binding

- [ ] The app is self-contained and exports HTTP (or other protocols) by binding to a port
- [ ] No external web server container (Apache, Tomcat) is required at runtime
- [ ] The port is configurable via environment variable (e.g., PORT)

## VIII. Concurrency

- [ ] The app scales horizontally by running multiple processes, not by making a single process larger
- [ ] Different process types (web, worker, scheduler) handle different workloads
- [ ] Processes do not daemonize or manage their own PID files; the platform manages process lifecycle
- [ ] Work is distributed via queues or load balancers, not in-process thread pools for scaling

## IX. Disposability

- [ ] Processes start up quickly (seconds, not minutes)
- [ ] Processes shut down gracefully on SIGTERM -- finish current requests, then exit
- [ ] Background jobs are reentrant or use idempotent operations so interrupted work can be retried
- [ ] The app handles unexpected process death without corruption (crash-only design)

## X. Dev/Prod Parity

- [ ] Development, staging, and production environments use the same backing services (same DB type, same queue)
- [ ] Time between code commit and production deploy is minimized (hours, not weeks)
- [ ] The same people who write code are involved in deploying and observing it in production
- [ ] Docker or similar tools ensure environment consistency across all stages

## XI. Logs

- [ ] The app writes logs to stdout/stderr, not to local files
- [ ] Log aggregation and routing are handled by the execution environment, not the app
- [ ] Logs are structured (JSON) for machine parsing
- [ ] Log levels (debug, info, warn, error) are used consistently and configurable at runtime

## XII. Admin Processes

- [ ] One-off admin tasks (migrations, console, data fixes) run as isolated processes in the same environment
- [ ] Admin scripts are checked into the codebase alongside application code
- [ ] Admin processes use the same config and backing services as the running app
- [ ] Database migrations are automated and run as part of the release process

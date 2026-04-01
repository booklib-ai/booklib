# Observability Checklist

## Logging

- [ ] Logs are structured (JSON) with consistent field names across all services
- [ ] Every request carries a correlation ID (trace ID / request ID) propagated through all downstream calls
- [ ] Log levels are used consistently: DEBUG for development, INFO for normal operations, WARN for recoverable issues, ERROR for failures requiring attention
- [ ] Logs never contain PII, secrets, tokens, or passwords -- sensitive data is masked or omitted
- [ ] Logs are shipped to a centralized aggregation system (ELK, Datadog, CloudWatch, Loki)
- [ ] Log retention policies are defined and enforced per compliance requirements

## Metrics and the Four Golden Signals

### Latency

- [ ] Request latency is measured at the server and reported as percentiles (p50, p95, p99), not just averages
- [ ] Latency distinguishes between successful and failed requests
- [ ] Slow endpoints are identified with latency budgets and tracked over time

### Traffic

- [ ] Request throughput (requests per second) is tracked per endpoint and per service
- [ ] Traffic patterns are baselined so anomalies (spikes, drops) trigger investigation
- [ ] Read vs. write traffic is measured separately for capacity planning

### Errors

- [ ] Error rate is measured as a percentage of total requests, broken down by status code and error type
- [ ] Client errors (4xx) and server errors (5xx) are tracked and alerted on separately
- [ ] Error budgets are defined and tracked against SLOs

### Saturation

- [ ] CPU, memory, disk, and network utilization are monitored for all services
- [ ] Queue depths and connection pool utilization are tracked
- [ ] Capacity thresholds are defined and alert before resources are exhausted

## Distributed Tracing

- [ ] All services are instrumented with a tracing library (OpenTelemetry, Jaeger, Zipkin)
- [ ] Trace context (trace ID, span ID) is propagated across HTTP, gRPC, and message queue boundaries
- [ ] Sampling strategy is configured to balance cost and visibility (head-based or tail-based sampling)
- [ ] Span attributes include service name, operation name, status code, and error details
- [ ] Critical paths (authentication, payment, data pipeline) have 100% trace sampling
- [ ] Trace data is correlated with logs and metrics via shared trace IDs

## Alerting

- [ ] Alerts are based on SLO burn rates, not arbitrary thresholds on raw metrics
- [ ] Alerts target symptoms (user-facing impact) rather than causes (high CPU)
- [ ] Every alert has a linked runbook with investigation steps and remediation actions
- [ ] Alert severity levels are defined: page (immediate), ticket (next business day), log (informational)
- [ ] Dashboards exist for each service showing the four golden signals at a glance
- [ ] Alert fatigue is managed -- noisy alerts are tuned or suppressed, and on-call burden is reviewed regularly

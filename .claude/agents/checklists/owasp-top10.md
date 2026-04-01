# OWASP Top 10 Security Review Checklist

## A01: Broken Access Control

- [ ] Every endpoint enforces authentication before processing the request
- [ ] Authorization checks use deny-by-default; access is granted only to explicitly permitted roles
- [ ] CORS allowlists are restrictive and do not use wildcard origins for authenticated endpoints
- [ ] Server-side access control cannot be bypassed by modifying URL parameters, request body, or headers
- [ ] Directory listing is disabled and metadata files (.git, .env) are not served
- [ ] Rate limiting is applied to APIs to prevent automated abuse

## A02: Cryptographic Failures

- [ ] Sensitive data (passwords, tokens, PII) is encrypted at rest and in transit
- [ ] TLS 1.2+ is enforced for all external connections; certificates are valid and pinned where appropriate
- [ ] Passwords are hashed with bcrypt, scrypt, or Argon2 -- never MD5 or SHA-1
- [ ] Encryption keys are stored in a secrets manager, not in source code or config files
- [ ] Deprecated cryptographic algorithms are not used anywhere in the codebase

## A03: Injection

- [ ] All database queries use parameterized statements or an ORM; no string concatenation of user input into SQL
- [ ] User input rendered in HTML is escaped or sanitized to prevent XSS
- [ ] OS command execution does not include unsanitized user input
- [ ] LDAP, XPath, and NoSQL queries are parameterized or use safe APIs
- [ ] Content-Type and Content-Length headers are validated on file uploads

## A04: Insecure Design

- [ ] Threat modeling has been performed for critical business flows
- [ ] Business logic enforces limits (e.g., purchase quantities, transfer amounts) server-side
- [ ] Abuse cases and negative test scenarios are part of the test suite
- [ ] Segregation of duties is enforced for sensitive operations (e.g., approval workflows)

## A05: Security Misconfiguration

- [ ] Default credentials are changed or disabled before deployment
- [ ] Error messages do not expose stack traces, SQL errors, or internal paths to users
- [ ] HTTP security headers are set: Content-Security-Policy, X-Content-Type-Options, Strict-Transport-Security
- [ ] Unnecessary features, ports, services, and accounts are disabled
- [ ] Cloud storage buckets and resources use least-privilege access policies
- [ ] Security hardening is automated and verified in CI/CD

## A06: Vulnerable and Outdated Components

- [ ] All dependencies are tracked in a lockfile and scanned for known CVEs
- [ ] Automated dependency update tooling (Dependabot, Renovate) is enabled
- [ ] Unused dependencies are removed from the project
- [ ] Components are sourced from official repositories and verified with checksums or signatures

## A07: Identification and Authentication Failures

- [ ] Multi-factor authentication is available for privileged accounts
- [ ] Session tokens are invalidated on logout, password change, and after a timeout period
- [ ] Password policies enforce minimum length (12+) and check against breached password lists
- [ ] Brute-force protection (account lockout or exponential backoff) is in place for login endpoints
- [ ] Session IDs are not exposed in URLs

## A08: Software and Data Integrity Failures

- [ ] CI/CD pipelines verify integrity of artifacts (signed commits, checksums)
- [ ] Deserialization of untrusted data uses safe libraries with allowlists of permitted classes
- [ ] Auto-update mechanisms verify signatures before applying updates
- [ ] Third-party code (CDN scripts, plugins) is loaded with Subresource Integrity (SRI) hashes

## A09: Security Logging and Monitoring Failures

- [ ] Authentication events (login, logout, failed attempts) are logged with timestamps and user context
- [ ] Logs do not contain sensitive data (passwords, tokens, PII)
- [ ] Log integrity is protected -- logs are append-only or shipped to an immutable store
- [ ] Alerting is configured for suspicious patterns (credential stuffing, privilege escalation)
- [ ] Incident response procedures are documented and tested

## A10: Server-Side Request Forgery (SSRF)

- [ ] User-supplied URLs are validated against an allowlist of permitted hosts and schemes
- [ ] Internal network addresses (169.254.x.x, 10.x.x.x, localhost) are blocked in outbound requests
- [ ] DNS rebinding protections are in place for URL fetching services
- [ ] HTTP redirects from user-supplied URLs are not followed blindly

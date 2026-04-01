# Google API Design Guide Checklist

## Resource-Oriented Design

- [ ] The API is organized around resources (nouns), not actions (verbs)
- [ ] Each resource has a clear, unique identity and a well-defined set of operations
- [ ] Resource relationships are expressed through hierarchy or references, not ad-hoc links
- [ ] Collection and singleton resources are distinguished in the schema

## Resource Names

- [ ] Resource names follow the pattern: `{service}/{collection}/{id}/{sub-collection}/{id}`
- [ ] Collection names are plural, lowercase, and use camelCase for multi-word names
- [ ] Resource IDs are URL-safe and assigned by the server or validated if client-assigned
- [ ] Full resource names are used in responses; relative names are avoided

## Standard Methods

### List

- [ ] Supports pagination via `page_size` and `page_token` parameters
- [ ] Returns an empty list (not an error) when no results match
- [ ] Supports filtering and ordering parameters where appropriate

### Get

- [ ] Returns the full resource representation for a single resource by name
- [ ] Returns 404 (NOT_FOUND) for non-existent resources

### Create

- [ ] Accepts the resource in the request body and returns the created resource
- [ ] Supports client-specified IDs via a `{resource}_id` parameter when appropriate
- [ ] Returns 409 (ALREADY_EXISTS) for duplicate creation attempts

### Update

- [ ] Uses field masks to support partial updates (PATCH semantics)
- [ ] Returns the full updated resource in the response
- [ ] Returns 404 (NOT_FOUND) if the resource does not exist

### Delete

- [ ] Returns an empty response or the deleted resource
- [ ] Is idempotent -- deleting an already-deleted resource returns success, not an error
- [ ] Supports soft delete where business requirements demand recoverability

## Custom Methods

- [ ] Custom methods use the `:customVerb` suffix on the resource URL (e.g., `/resources/{id}:cancel`)
- [ ] Custom methods are used only when standard methods cannot express the operation
- [ ] Custom methods use POST (or GET for safe, idempotent reads)

## Naming Conventions

- [ ] Field names use `lower_snake_case`
- [ ] Enum values use `UPPER_SNAKE_CASE` with a 0-value named `UNSPECIFIED`
- [ ] Boolean fields are named as adjectives or past participles: `is_active`, `has_children`, `enabled`
- [ ] Timestamps use `google.protobuf.Timestamp` or ISO 8601 strings with timezone

## Error Handling

- [ ] Errors use standard HTTP status codes (400, 401, 403, 404, 409, 429, 500, 503)
- [ ] Error responses include a machine-readable error code, human-readable message, and optional details
- [ ] Validation errors list all invalid fields, not just the first one encountered
- [ ] Retry-safe errors include `Retry-After` headers or backoff guidance

## Versioning

- [ ] The major version is included in the URL path (e.g., `/v1/`, `/v2/`)
- [ ] Breaking changes increment the major version; backward-compatible changes do not
- [ ] Deprecated fields and endpoints are annotated and have a documented sunset timeline

## Design Patterns

- [ ] Long-running operations return an Operation resource with polling or callback support
- [ ] Batch operations are supported for performance-critical bulk actions
- [ ] ETags are used for optimistic concurrency control on update and delete
- [ ] Request validation is performed before any side effects

## Documentation

- [ ] Every resource, method, and field has a description in the API schema
- [ ] Request and response examples are provided for each method
- [ ] Error codes and their meanings are documented
- [ ] Rate limits and quotas are documented with guidance on handling 429 responses

## Compatibility

- [ ] New fields have default values that preserve existing behavior
- [ ] Removed fields are reserved to prevent accidental reuse in future versions
- [ ] Clients are not required to send unknown fields, and servers ignore them gracefully

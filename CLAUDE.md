# Ambient serverless AI agent demo

Producer (Node.js Lambda) → Amazon MSK (Kafka) → consumer (Python Lambda via MSK event source mapping) acting as an AI agent. Built piece by piece; Terraform under `terraform/`.

## Working agreement

- Claude builds and validates (`terraform fmt`, `validate`, `plan`, read-only AWS calls). The user deploys. Never run `terraform apply`/`destroy`, `make deploy`/`destroy`, or other mutating AWS commands.
- The user tests the webapp locally with `make watch` (nodemon, against the deployed AWS backend; it also reads the login secret from the deployed Secrets Manager secret). After every change, say which is needed:
  - `webapp/static/*` → just reload the browser (served from disk).
  - `webapp/*.js` → nodemon restarts it automatically; reload the browser. `webapp/login.html` is read once at startup → restart `make watch`.
  - `producer/`, `consumer/`, `terraform/` → `make deploy` (the local webapp calls the deployed producer; the consumer always runs in AWS).
- Keep learnings in this file, not Claude's per-user memory. Only record what's non-obvious and will change a future decision; skip anything derivable from the code.

## Decisions

- **MSK on `kafka.t3.small` / Kafka 3.9.x is a cost choice** (~4.5× cheaper than `m7g.large`). Don't move to Kafka 4.x (KRaft-only, needs m5/m7g) unless the user asks.
- **One allow-all security group for the whole VPC** (`module.kafka` output `security_group_id`), used by MSK, Lambdas, and endpoints. Don't add per-component SGs.
- **Consumer ESM uses on-demand mode, not provisioned.** It needs interface VPC endpoints for Lambda and STS in the MSK subnets — add them when building the consumer.

## Gotchas

- LLM calls use plain boto3 `bedrock-runtime` `invoke_model` (Messages API body) with the `global.anthropic.claude-haiku-5-5` inference profile — no Anthropic SDK, no Lambda layer; the user wants it kept that simple. The Bedrock Mantle endpoint 404s for Haiku 5.5 in the test1 account.

- Removing a security group that a VPC Lambda still uses hangs `apply` (~25+ min): Terraform destroys the SG before updating the Lambda off it. Move the Lambda to the new SG in one apply, remove the old SG in a later one. On `destroy`, the producer's ENIs ("AWS Lambda VPC ENI-…") can linger `available` after the function is gone; delete them so the SG/VPC can be removed.

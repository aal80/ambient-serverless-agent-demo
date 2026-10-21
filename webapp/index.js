import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import express from "express";
import { createAuth, loadSecrets } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The Web Functions runtime probes this exact host:port for readiness.
const [HOST, PORT] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || "0.0.0.0:3000").split(":");

const lambda = new LambdaClient({});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 100;
const DEFAULT_DELAY_MS = 100;
const MAX_DELAY_MS = 5000;

const secrets = await loadSecrets();

const app = express();
// Must come first: every route below requires a signed-in session.
app.use(createAuth(secrets));
// `extensions` serves /technical from technical.html.
app.use(express.static(join(__dirname, "static"), { extensions: ["html"] }));
app.use(express.json({ limit: "16kb" }));

// AppSync connection details for the browser. The API key only allows subscribing.
app.get("/api/config", (req, res) => {
  res.json({
    httpDomain: process.env.APPSYNC_HTTP_DOMAIN,
    realtimeDomain: process.env.APPSYNC_REALTIME_DOMAIN,
    apiKey: process.env.APPSYNC_API_KEY,
  });
});

app.post("/api/messages", async (req, res) => {
  const { userId, sessionId, customerMessage, delayMs = DEFAULT_DELAY_MS } = req.body ?? {};

  if (!UUID.test(userId ?? "") || !UUID.test(sessionId ?? "")) {
    return res.status(400).json({ error: "userId and sessionId must be UUIDs" });
  }
  if (typeof customerMessage !== "string" || customerMessage.trim() === "") {
    return res.status(400).json({ error: "customerMessage must be a non-empty string" });
  }
  if (customerMessage.trim().length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `customerMessage exceeds ${MAX_MESSAGE_LENGTH} characters` });
  }
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > MAX_DELAY_MS) {
    return res.status(400).json({ error: `delayMs must be an integer between 0 and ${MAX_DELAY_MS}` });
  }

  // Accepted, not answered: the agent's reply arrives asynchronously via AppSync. The response
  // streams workflow steps 1-3 (one JSON object per line) for the architecture view.
  res.status(202).type("application/x-ndjson");
  const trace = async (event) => {
    res.write(`${JSON.stringify({ type: "trace", ...event })}\n`);
    await sleep(delayMs);
  };

  try {
    await trace({ step: 1 }); // prompt received from the web UI
    await trace({ step: 2 }); // sending the prompt to the producer

    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.PRODUCER_FUNCTION_NAME,
        Payload: JSON.stringify({ userId, sessionId, customerMessage: customerMessage.trim(), delayMs }),
      }),
    );
    const payload = JSON.parse(Buffer.from(result.Payload).toString());
    if (result.FunctionError) throw new Error(JSON.stringify(payload));

    await trace({ step: 3, partition: payload.partition, offset: payload.offset }); // record in Kafka
  } catch (err) {
    console.error("Producer failed", err);
    res.write(`${JSON.stringify({ type: "error", error: "Failed to enqueue message" })}\n`);
  }
  res.end();
});

app.listen(Number(PORT), HOST, () => console.log(`Listening on ${HOST}:${PORT}`));

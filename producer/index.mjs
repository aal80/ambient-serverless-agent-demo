import { Kafka, Partitioners, logLevel } from "kafkajs";

const topic = process.env.KAFKA_TOPIC;
const MAX_MESSAGE_LENGTH = 100;

const kafka = new Kafka({
  clientId: "producer",
  brokers: process.env.KAFKA_BOOTSTRAP_BROKERS.split(","),
  logLevel: logLevel.WARN,
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

// Connect once per execution environment and reuse across invocations.
let connecting;

export const handler = async (event) => {
  const { userId, sessionId, customerMessage, delayMs } = event;

  for (const [name, value] of Object.entries({ userId, sessionId, customerMessage })) {
    if (typeof value !== "string" || value === "") {
      throw new Error(`${name} must be a non-empty string`);
    }
  }
  if (customerMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`customerMessage exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  connecting ??= producer.connect().catch((err) => {
    connecting = undefined;
    throw err;
  });
  await connecting;

  // Keyed by sessionId so all messages in a session land on one partition, in order.
  const [result] = await producer.send({
    topic,
    messages: [
      {
        key: sessionId,
        value: JSON.stringify({
          userId,
          sessionId,
          customerMessage,
          delayMs, // per-step delay for the architecture view; the consumer applies it
          timestamp: new Date().toISOString(),
        }),
      },
    ],
  });

  return { topic, partition: result.partition, offset: result.baseOffset };
};

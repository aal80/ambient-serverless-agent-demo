import base64
import json
import traceback

import agent
import llm
from appsync import Session

DEFAULT_DELAY_MS = 100
MAX_DELAY_MS = 5000


def handler(event, context):
    # MSK events group records by "topic-partition".
    for records in event["records"].values():
        for record in records:
            message = json.loads(base64.b64decode(record["value"]))
            print(json.dumps({
                "topic": record["topic"],
                "partition": record["partition"],
                "offset": record["offset"],
                "message": message,
            }))
            process(message, record)


def process(message, record):
    """The consumer app: runs the agent on one message and sends the reply. Reports steps 4, 5, 10, 11."""
    delay_ms = min(max(int(message.get("delayMs", DEFAULT_DELAY_MS)), 0), MAX_DELAY_MS)
    session = Session(message["sessionId"], delay_ms)

    session.trace(4, partition=record["partition"], offset=record["offset"])  # record retrieved
    session.trace(5)  # agent started

    try:
        reply = agent.run(message["customerMessage"], session)
    except llm.RefusalError:
        reply = "Sorry, I can't help with that request."
    except Exception:
        # Reply instead of raising: a raised error would make the event source mapping
        # retry this record forever and block the partition.
        traceback.print_exc()
        reply = "Sorry, something went wrong on our side. Please try again in a moment."

    session.trace(10)  # agent returned the response
    session.trace(11)  # sending the response to AppSync
    session.final(reply)

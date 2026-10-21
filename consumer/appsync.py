import json
import os
import time
import urllib.request

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

APPSYNC_HTTP_DOMAIN = os.environ["APPSYNC_HTTP_DOMAIN"]

session = boto3.Session()


class Session:
    """Publishes to one chat session's channel: chat messages, plus workflow trace events."""

    def __init__(self, session_id, delay_ms):
        self.channel = f"/sessions/{session_id}"
        self.delay_seconds = delay_ms / 1000

    def trace(self, step, **meta):
        """Report a workflow step to the architecture view, then pause so fast steps stay visible."""
        publish(self.channel, {"type": "trace", "step": step, **meta})
        time.sleep(self.delay_seconds)

    def progress(self, text):
        publish(self.channel, {"type": "progress", "text": text})

    def final(self, text):
        publish(self.channel, {"type": "final", "text": text})


def publish(channel, event):
    """Publish one event to an AppSync Events channel, signed with the function's IAM role."""
    body = json.dumps({"channel": channel, "events": [json.dumps(event)]})
    request = AWSRequest(
        method="POST",
        url=f"https://{APPSYNC_HTTP_DOMAIN}/event",
        data=body,
        headers={"content-type": "application/json"},
    )
    SigV4Auth(session.get_credentials(), "appsync", session.region_name).add_auth(request)

    with urllib.request.urlopen(urllib.request.Request(
        request.url, data=body.encode(), headers=dict(request.headers), method="POST",
    )) as response:
        result = json.loads(response.read())

    if result.get("failed"):
        raise RuntimeError(f"AppSync publish failed: {result['failed']}")

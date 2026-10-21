"""Claude Haiku 5.5 on Amazon Bedrock (bedrock-runtime InvokeModel, Messages API body)."""

import json
import os

import boto3

MODEL_ID = os.environ["MODEL_ID"]
MAX_OUTPUT_TOKENS = 150

bedrock = boto3.client("bedrock-runtime")

COMPANY_CONTEXT = "You work for VoltBay, an online retail store that sells consumer electronics."

CLASSIFY_TOOL = {
    "name": "classify_request",
    "description": "Record which kind of support request the customer message is.",
    "input_schema": {
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "enum": ["technical_support", "refund", "order_tracking", "other"],
                "description": (
                    "technical_support: a problem using or setting up a product. "
                    "refund: the customer wants their money back or to return an item for a refund. "
                    "order_tracking: the customer asks where an order is or when it will arrive. "
                    "other: anything else."
                ),
            },
        },
        "required": ["category"],
    },
}

ORDER_REFERENCE_TOOL = {
    "name": "record_order_reference",
    "description": "Record whether the customer message identifies a specific order.",
    "input_schema": {
        "type": "object",
        "properties": {
            "has_order_reference": {
                "type": "boolean",
                "description": (
                    "True if the message contains an order ID/number, or describes a specific purchased item "
                    "(for example 'my Sony headphones' or 'the laptop I bought last week'). "
                    "False if there is nothing that points to a particular order."
                ),
            },
            "order_reference": {
                "type": "string",
                "description": (
                    "A short phrase naming the order, e.g. 'order #48213' or 'your Sony headphones'. "
                    "Empty string if has_order_reference is false."
                ),
            },
        },
        "required": ["has_order_reference", "order_reference"],
    },
}


class RefusalError(Exception):
    pass


def classify(customer_message):
    result = _call_tool(
        f"{COMPANY_CONTEXT} Classify the customer's message for routing.",
        customer_message,
        CLASSIFY_TOOL,
    )
    return result["category"]


def find_order_reference(customer_message):
    result = _call_tool(
        f"{COMPANY_CONTEXT} Decide whether the customer's message identifies a specific order.",
        customer_message,
        ORDER_REFERENCE_TOOL,
    )
    if not result["has_order_reference"] or not result["order_reference"].strip():
        return None
    return result["order_reference"].strip()


def suggest_fix(customer_message):
    response = _invoke(
        system=(
            f"{COMPANY_CONTEXT} You are its technical support agent. Reply to the customer with exactly two "
            "very short paragraphs of plain text, two sentences each, suggesting the most likely solution to "
            "their problem. No greeting, no markdown, no bullet points, no headings."
        ),
        messages=[{"role": "user", "content": customer_message}],
    )
    text = "".join(block["text"] for block in response["content"] if block["type"] == "text").strip()
    if response["stop_reason"] == "max_tokens":
        # Cut off by the output cap: drop the trailing partial sentence.
        text = text[: max(text.rfind(end) for end in (".", "!", "?")) + 1] or text
    return text


def _call_tool(system, customer_message, tool):
    # Forcing the tool gives structured output.
    response = _invoke(
        system=system,
        tools=[tool],
        tool_choice={"type": "tool", "name": tool["name"]},
        messages=[{"role": "user", "content": customer_message}],
    )
    return next(block["input"] for block in response["content"] if block["type"] == "tool_use")


def _invoke(**request):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_OUTPUT_TOKENS,
        # Thinking would count toward max_tokens; disabling it is allowed at effort low.
        "thinking": {"type": "disabled"},
        "output_config": {"effort": "low"},
        **request,
    }
    response = json.loads(bedrock.invoke_model(modelId=MODEL_ID, body=json.dumps(body))["body"].read())
    if response["stop_reason"] == "refusal":
        raise RefusalError(response.get("stop_details"))
    return response

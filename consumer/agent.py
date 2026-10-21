"""Simulated support agent: the LLM picks a tool, the tool does the work. Order systems are faked."""

import random
import secrets
import time
from collections import namedtuple
from datetime import date, timedelta

import llm

STREETS = [
    "Maple Avenue", "Oak Street", "Harbor Drive", "Elm Court", "Sunset Boulevard",
    "Pine Ridge Road", "Cedar Lane", "Willow Way", "Lakeview Drive", "Birch Street",
    "Highland Avenue", "Meadow Lane", "Riverbend Road", "Chestnut Street", "Park Place",
    "Hillcrest Drive", "Magnolia Boulevard", "Spruce Court", "Sycamore Avenue", "Brookside Terrace",
]
CITIES = [
    "Springfield, IL 62704", "Riverside, CA 92501", "Madison, WI 53703", "Portland, OR 97205",
    "Austin, TX 78701", "Denver, CO 80202", "Seattle, WA 98101", "Boston, MA 02108",
    "Nashville, TN 37203", "Raleigh, NC 27601", "Phoenix, AZ 85004", "Columbus, OH 43215",
    "Minneapolis, MN 55401", "Salt Lake City, UT 84101", "Kansas City, MO 64105", "Pittsburgh, PA 15222",
    "Sacramento, CA 95814", "Tampa, FL 33602", "Boise, ID 83702", "Albuquerque, NM 87102",
]

NEED_ORDER_DETAILS = (
    "I couldn't tell which order you mean. Could you share your order number (for example #48213) "
    "or describe the item, like \"my Sony headphones\"?"
)


def run(text, session):
    """Answer one customer message. Reports workflow steps 6–9 through `session.trace`."""
    session.trace(6)  # agent calls the LLM
    category = llm.classify(text)
    tool = TOOLS_BY_CATEGORY.get(category)
    session.trace(7, category=category, tool=tool and tool.name)  # LLM replies

    if tool is None:
        return "I can help with technical questions, refunds, and order tracking. What can I do for you?"

    session.trace(8, tool=tool.name)  # agent calls the tool
    session.progress(tool.announcement)
    session.trace(9, tool=tool.name)  # tool runs
    return tool.run(text, session)


# --- Tools ---------------------------------------------------------------------------------------

def tech_support(text, session):
    return llm.suggest_fix(text)


def order_system(text, session):
    order = llm.find_order_reference(text)
    if order is None:
        return NEED_ORDER_DETAILS

    simulate_backend_work(lambda: session.progress("Located your order, checking status…"))

    arrival = date.today() + timedelta(days=random.randint(1, 5))
    return (
        f"Good news! I found {order}. It's on its way and scheduled to arrive on "
        f"{arrival:%A, %B} {arrival.day}, delivered to {fake_address()}. "
        f"Tracking number: VB{secrets.randbelow(10**10):010d}."
    )


def payments(text, session):
    order = llm.find_order_reference(text)
    if order is None:
        return NEED_ORDER_DETAILS

    simulate_backend_work(lambda: session.progress("Processing refund request…"))

    return (
        f"Your refund request for {order} was processed successfully. "
        f"Transaction ID: RF-{secrets.token_hex(4).upper()}. "
        "The refund will appear on your original payment method within 3–5 business days."
    )


Tool = namedtuple("Tool", "name announcement run")

TOOLS_BY_CATEGORY = {
    "technical_support": Tool("tech_support", "Checking with technical support…", tech_support),
    "order_tracking": Tool("order_system", "Looking up your order…", order_system),
    "refund": Tool("payments", "Validating your refund request…", payments),
}


def simulate_backend_work(midpoint):
    """Wait 3–5 seconds, calling `midpoint` halfway through."""
    half = random.uniform(3, 5) / 2
    time.sleep(half)
    midpoint()
    time.sleep(half)


def fake_address():
    return f"{random.randint(100, 9999)} {random.choice(STREETS)}, {random.choice(CITIES)}"

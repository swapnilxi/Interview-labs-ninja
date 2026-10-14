"""Pure helpers for `POST /quick-tasks/eisenhower-auto` (no AI, no database — easy to test).

TypeScript twin: frontend/fe-apis/todo/quick/autoSort.ts — keep the two in sync.
"""

from __future__ import annotations

from typing import Any, Dict, List

# A quick task starts "unsorted": captured, not yet placed in an Eisenhower quadrant. It is a plain string
# (not NULL) so every server version and the guest/Next.js twins agree on it, and an older server that
# only knows the four quadrants still stores it.
UNSORTED = "unsorted"
QUADRANTS = ("do_now", "schedule", "delegate", "eliminate")


def pick_tasks_to_sort(undone: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Which tasks the AI should sort.

    The ones still unsorted, so a quadrant you picked yourself is never overwritten. Only when nothing is
    unsorted (an all-sorted day, or tasks from before "unsorted" existed) is everything sorted again, so
    the button still does something.
    """
    unsorted = [t for t in undone if (t.get("quadrant") or UNSORTED) == UNSORTED]
    return unsorted or undone


def clean_assignments(assignments: Any, to_sort: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep only what is safe to write back: ids we asked about, and real quadrants.

    Never lets the model write "unsorted" or free text, or touch a task it was not shown. Ids are
    coerced to int because models sometimes answer "5" for 5.
    """
    asked = {t["id"] for t in to_sort}
    cleaned: List[Dict[str, Any]] = []
    for assignment in assignments if isinstance(assignments, list) else []:
        if not isinstance(assignment, dict):
            continue
        try:
            task_id = int(assignment.get("task_id"))
        except (TypeError, ValueError):
            continue
        if task_id in asked and assignment.get("quadrant") in QUADRANTS:
            cleaned.append({**assignment, "task_id": task_id})
    return cleaned

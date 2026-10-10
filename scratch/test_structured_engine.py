#!/usr/bin/env python3
"""
scratch/test_structured_engine.py
Test generation of rich structured lessons for all topics.
"""
import sys
import os

sys.path.insert(0, os.path.abspath('backend'))
from modules.ai_lms.visual_engine import build_structured_lesson_html

test_cases = [
    ("Load Balancers", "System Design", "Distributed Systems", "Load balancers distribute traffic across multiple nodes."),
    ("CAP Theorem", "System Design", "Distributed Systems", "In distributed data stores it is impossible to simultaneously provide more than two out of Consistency, Availability, and Partition tolerance."),
    ("Memoization vs Tabulation", "DSA Preparation", "Dynamic Programming", "Comparing top-down recursive caching vs bottom-up iterative table construction."),
    ("Introduction to LangGraph", "Other", "Agent Architectures", "LangGraph enables building stateful, multi-actor applications with LLMs using cycles."),
    ("Generative Agent Workflows", "Other", "Autonomous Agents", "Workflows that combine LLMs with tool execution, planning, and memory."),
    ("Scalability Fundamentals", "System Design", "Distributed Systems", "Horizontal vs vertical scaling, stateless services, and bottlenecks."),
]

for title, cls, subj, content in test_cases:
    html = build_structured_lesson_html(
        title=title,
        class_name=cls,
        subject_name=subj,
        content=content,
        raw_ai_output="",
    )
    print(f"[{title}] Length: {len(html)} bytes | Has DOCTYPE: {'<!DOCTYPE html>' in html} | Has Quiz: {'quiz-section' in html} | Has Visual: {'lms-visualizer' in html or '<svg' in html}")

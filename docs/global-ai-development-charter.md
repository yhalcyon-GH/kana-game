# Global AI Development Charter

Version: 0.1  
Status: Experimental

This charter defines project-independent principles for AI-assisted software development.

It is not an agent instruction manual. Project-specific implementation belongs in project contracts, skills, scripts, CI, and human review gates. The charter should remain small and change only when practical evidence shows that its principles need revision.

1. Human owners define goals, acceptance criteria, priorities, and consequential decisions.
2. Use the simplest reliable mechanism that can satisfy the goal.
3. Use AI where judgment, synthesis, exploration, or adaptation adds real value.
4. Prefer deterministic scripts, tests, hooks, and CI for deterministic work.
5. Treat model calls, context, human attention, and time as limited resources.
6. Give each agent only the context needed to complete the current task safely.
7. Search narrowly, verify important assumptions, and stop exploring when evidence is sufficient.
8. Prefer small, reversible changes over broad changes unless broader scope is clearly justified.
9. Verify locally and narrowly during iteration; perform broader verification before completion.
10. Escalate ambiguous, high-impact, destructive, security-sensitive, or hard-to-reverse decisions to a human.
11. Convert repeated failures into durable tests, rules, workflows, or automation at the lowest appropriate layer.
12. Automate only when repetition or measured benefit justifies the added complexity.
13. Measure whether the development system improves quality, safety, speed, and resource usage—and simplify or remove mechanisms that do not.

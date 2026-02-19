---
name: review
description: Review Decentraland scene code quality and suggest improvements
---

Review the current Decentraland scene for code quality, performance, and best practices.

Check for:
1. **SDK7 correctness**: Are components used correctly? Any deprecated patterns?
2. **Performance**: Entity count, unnecessary systems, unoptimized loops, large textures
3. **Scene limits**: Are entities/triangles within parcel budgets?
4. **Code organization**: Is code modular? Are there unused imports?
5. **Interactivity**: Are pointer events properly cleaned up?
6. **Common mistakes**: Missing `main()` export, wrong import paths, mutable state in systems
7. **TypeScript**: Type safety, proper use of SDK types

Read the scene files first, then provide actionable feedback organized by severity (critical, warning, suggestion).

$@

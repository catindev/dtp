# Game loop

The workday runs from 08:00 to 18:00. Time moves by itself, but you can pause the game.

## 1. Tasks arrive in the backlog

The backlog is the list of incoming work. A task does not spend its delivery deadline while it is still untouched in the backlog. Instead, its opportunity value slowly fades.

If backlog value reaches zero, the task disappears as a missed opportunity and adds a small amount of debt.

## 2. Move a task into progress

A task in "In Progress" is not done yet. You need to assign team members to it.

When you first move a task from the backlog into progress, the real delivery deadline starts. From that moment, the team has made a commitment.

## 3. Assign people to subtasks

Drag a character onto a task card. The game picks a suitable visible subtask for that character.

If someone works outside their strongest role, the result may be worse and they may lose more stamina.

## 4. Move good enough work to Done

When a task looks clean enough, move it to "Done". Before 18:00 you can still reopen it, but reopening costs trust.

## 5. At 18:00 tasks ship to Prod

Only shipped tasks affect the business. Clean releases help. Dirty releases can create follow-up work for the next day.

The "Prod" column is history. You can switch between shipped tasks and unfinished work that has already turned into a consequence or a capped resource hit.

## 6. Read the morning fallout

The morning briefing shows what happened after yesterday's release. If yesterday's release carried risk, today may start with a new consequence task. If backlog opportunities faded out, the briefing shows how much value was lost and how much debt was added.

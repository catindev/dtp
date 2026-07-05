# Tasks, quality, and risk

Tasks have several important properties.

## Value

Value shows how much business benefit the task can create if it reaches release.

In the backlog, value can fade. That means the opportunity is getting older: the task may still help, but less than when it first arrived.

## Clarity

Clarity shows how well the team understands what needs to be done.

Low clarity means a higher chance of weak implementation. The analyst helps raise clarity.

## Quality

Quality shows how well the work was implemented.

Low quality increases the chance of bugs and bad release consequences.

## QA

QA coverage shows how well the task was checked.

If implementation changes after QA, the old test coverage can become stale. Then the task needs another QA pass.

## Bugs

Bugs are known problems. QA can find bugs. Developers then turn them into rework.

## Tech debt

Tech debt tasks are about the internal state of the product: simplify old code, remove a hack, split a tangled module.

Normal clean releases reduce debt a little. Clean tech debt releases reduce debt much more. This is not free recovery: to pay debt down, you still need to take the task, work on it, check it, and ship it.

## Dirty, risky, clean

Card color and status show the rough state:

- green means the task is safer to ship;
- yellow means there is risk, but it may be acceptable;
- gray or red means the task probably needs more work.

The deadline does not make a task risky by itself. If the task is clean but the deadline is close, it is still clean. Watch time through the deadline bar and card pulse. If the deadline is already missed, the card shows a separate late penalty and Value loss.

The game does not forbid risk. It shows the price of risk.

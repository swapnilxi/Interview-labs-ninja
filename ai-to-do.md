# AI To-Do — UX / UI Audit & Fix Checklist

Audit date: **2026-10-13**. Scope: the whole To-Do area (`/ai-todo`: Quick Daily, Smart To-Do, Plan & Project, Goals, Copilot panel, Distraction Inbox).
Plan: **implement this checklist first**, then add new features and a new design style (see "Parked for later" at the bottom).

**Status (2026-10-14):** **Phase 0 and Phase 1 are done**, plus 4.1, 4.2 and 4.4 (Quick Daily — you asked for those first) and a new item, 1.10 (Montserrat everywhere). Verified by **542 automated checks** — 430 in the browser (guest and logged-in, desktop and phone, `fastapi` mode) and 112 API checks that run identically against FastAPI and the `nextjs-api` twin — and, for Phase 0, an independent code review whose findings are fixed. Decisions you made along the way: **comfortable** density by default; clean fonts like **Montserrat**, never mono / script / coder, app-wide; **flat icons** from react-icons; keep the `fe-apis` twin in step with every API change. Next: **Phase 2** (page frame & navigation — 2.1, getting your tasks above the fold, is the biggest remaining win), then Phase 3 (calming the Smart task row, 3.1) and the rest of Phase 4. Items below carry a *Done* note where finished.

**Smart To-Do visual pass (2026-10-15):** calmer layout, restrained multicolour accents and colour-coded depth rails are in for the Smart tab and the page frame (header, tabs, Copilot, floating buttons). Quick Daily, Plan & Project and Goals keep their old look until their own pass. Checked with 89 browser checks (desktop, phone, guest, light and dark) against scratch copies of the databases. Items it touches: 2.1, 2.3, 2.7, 3.1, 9.4.

## How this was audited

- Read the core of `frontend/src/modules/ai-todo/` closely (Smart To-Do, Quick Daily, Plan & Project, Goals cards, the shared matrix, `page.tsx`, the `todo-*` CSS, the guest/logged-in service layer). The smaller dialogs (GoalDetail / CreateGoal, ProjectNodeDetail, QuickTaskDetail, ProjectRoadmap, GoalTimelineBoard, ParetoSidebar) were only grepped for the shared patterns (overlays, Esc, native dialogs, dead classes) — give them a closer look when migrating them to the shared Modal.
- Ran the app against **scratch copies** of the databases (never the real DB) and drove it with Playwright: guest mode and a logged-in user, desktop 1440×900 and phone 390×844, light and dark, with real seeded data.
- Items **without a tag were reproduced in the browser**. `(code)` = found by reading the code, not reproduced. Measured numbers are quoted where I have them.
- Sizes are rough: **S** under an hour · **M** half a day · **L** a day or more.

## Diagnosis

The module has plenty of features. The problem is the *surface*: your tasks are the hardest thing to see (at 1440×900 the first task card starts at y≈785), every task card carries ~10 controls at once, the task-detail dialog renders as a clipped strip and can't be closed with Esc, and some menu items sit underneath the next card so they can't be clicked. None of that is a design-style problem. It is plain usability, and it comes first.

**North star — the daily loop should feel effortless:**
1. **Capture** in two seconds, from anywhere, without a modal (type, Enter).
2. **See what to do now** on the first screen, with no scrolling.
3. **Check it off** instantly, with a small reward and an undo.
4. **Go deeper** (details, AI breakdown) only when asked; never in the way.

## Start here (biggest wins first)

If you only do ten things, do these, in this order: **0.1 · 0.2 · 1.1/0.3 · 2.1 · 3.1 · 4.1 + 4.2 · 7.1 · 0.4 · 3.2 · 2.2/2.3**. Then 0.5, 0.6, 10.1.
*(Done so far: **all of Phase 0 and Phase 1** — 0.1–0.9, 1.1–1.10 — plus 4.1, 4.2, 4.4. Still to do: 2.1 · 3.1 · 7.1 · 3.2 · 2.2/2.3 · 10.1.)*

---

## Phase 0 — Broken things (fix first)

- [x] **0.1 Detail dialogs render clipped inside the task card** · M
  Click a task title in Smart To-Do: the "full-screen" overlay is only **976×112 px** (the card's size); the dialog's header, title field and ✕ are cut off. Quick Daily's task dialog is **274×74 px**. Cause: the dialog is rendered *inside* the card, and the card's hover `transform` makes it the containing block for `position: fixed`. Because the overlay is a child of the card, hovering it keeps the card "hovered"; I also saw the measured overlay size and the screenshot disagree while moving the pointer, so it may flicker (inferred, not isolated).
  *Where:* `tasks/TaskNode.tsx` (renders `TaskDetailModal` + `ParetoModal` per row), `quick/QuickTaskCard.tsx` (renders `QuickTaskDetailModal` + `ParetoModal`), CSS `.todo-lit:hover` / `.todo-task-card:hover` in `src/styles/tailwind.css`.
  *Fix:* render every overlay through a portal to `<body>` (see 1.1). Also stop lifting list rows on hover (`translateY`): a column of lifting cards is noisy, and *any* `transform`/`translate`/`filter` on a card re-creates this bug.
  *Done (2026-10-14):* every dialog now renders through `components/ui/Modal.tsx` (portal to `<body>`), so a card can no longer clip it. Verified: the overlay is the full viewport, the ✕ is the topmost clickable element, and the size stays put while the pointer moves. Rows still lift on hover (kept for now); a comment in `tailwind.css` warns never to put overlays inside `.todo-lit` / `.todo-task-card`.

- [x] **0.2 Menus are covered by the next card** · M
  Smart To-Do: with the status menu open, **"Done" and "Not Done" are underneath the next task card** and can't be clicked; "Delayed" is half hidden. Quick Daily: the "Move to Plan & Project" item is covered the same way. The priority menu and the Move/Delete popovers use the same pattern (same cause, not individually reproduced). The status menu also stays open when you click elsewhere and ignores Esc.
  *Where:* `tasks/TaskNode.tsx` (status, priority, move, delete popovers), `quick/QuickTaskCard.tsx` (move, delete popovers).
  *Fix:* one shared Menu/Popover (see 1.2): portal, click-outside, Esc, arrow keys.
  *Done (2026-10-14):* status, priority, move and delete menus (`TaskNode`), move/delete (`QuickTaskCard`) and the Goal *Move to* menu use `components/ui/Popover.tsx` — portal, flips above near the bottom edge, outside-click, Esc, arrow keys, focus returns to the trigger. Verified every item is clickable (including *Done* and the last Quick *Move* item). The delete confirm opens with *Cancel* focused.

- [x] **0.3 Dialogs can't be dismissed with Esc or a backdrop click** · M
  Only `AddTaskModal` handles Esc/backdrop and has `role="dialog"`. Reproduced on the task, Brain Dump and project-node dialogs; the rest have no Esc handler either (grep). None of them, `AddTaskModal` included, traps focus, restores focus, or locks page scroll. Combined with 0.1 (✕ cut off), a user can end up with a dialog they can't close.
  *Where:* `TaskDetailModal`, `QuickTaskDetailModal`, `ProjectNodeDetailModal`, `CreateProjectModal`, `CreateGoalModal`, `GoalDetailModal`, `ParetoModal` (in `components/ui/`), the StartDay / EndDay / BrainDump modals in `TaskTree.tsx`, the three overlays in `QuickDaily.tsx`, and the inbox drawer in `app/ai-todo/page.tsx`.
  *Fix:* migrate all of them to the shared Modal (1.1).
  *Done (2026-10-14):* all 14 hand-rolled overlays migrated (Esc, backdrop click, focus trap + restore, scroll lock, inert page, `role="dialog"`). Forms and dumps with typed input ignore backdrop clicks (Add Task, New/Edit Goal, New Project, Brain Dump) — Esc still closes. Detail dialogs now **save pending edits before closing** (Esc/backdrop never fire a blur, so they'd have lost them) and only close once that worked: if a save fails the dialog stays open with the error and *Retry* so nothing typed is lost, and closing a second time discards it (a server that keeps failing can't trap you). Selects never block closing — they snap back instead. The Resume side panel also closes with Esc. **Found while testing:** typing a space or Enter in the Quick task dialog was swallowed — dnd-kit's keyboard sensor on the draggable card reacted to keydowns bubbling up from the dialog (React events cross portals), and Space on a card's own buttons started a drag too. Fixed in `EisenhowerMatrix.tsx` (`SortableCard`): a keyboard drag now only starts when the card itself has focus.
  *Hardened after an independent code review (2026-10-14):* **Retry** can no longer replay an older payload over text typed since (a newer save of the same field supersedes a failed one: fail "A", type "AB", press Retry → the server ends with "AB"); a backdrop click no longer throws away an *unsent* note or subtask title; a save that never answers can't trap the dialog (the second Esc/✕ always closes); focus returns to the button that opened a dialog even when the dialog autofocuses a field; with a dialog open over the Resume panel, Esc closes only the dialog (the panel joined the layer stack).

- [x] **0.4 A subtask added in the detail dialog doesn't appear in the tree, and the input loses focus** · S
  Add "Child one" in the dialog → close → the tree still shows 3 rows; after a reload it shows 4. Cause: the dialog calls `onUpdate()` with no data, which `TaskTree.updateTaskInTree` ignores. Also, adding a subtask reloads the whole dialog body (spinner), so the input unmounts and you must click it again before adding the next one.
  *Where:* `tasks/TaskDetailModal.tsx` (`handleAddSubtask`, `loadTaskData`), `tasks/TaskTree.tsx` (`updateTaskInTree`, `addChildrenToTask`).
  *Fix:* on create, call a "child added" callback that appends to the tree; refresh the dialog's data without the full-body loading state; keep focus in the input.
  *Done (2026-10-14):* a new `onChildAdded` path appends exactly one child to the tree (the AI path, `onChildrenGenerated`, *replaces* siblings, so it couldn't be reused). The dialog no longer reloads itself, so the input keeps focus and several subtasks can be typed in a row. Also fixed here: the subtask list was capped at 48px (`max-h-48` is a pixel value in this repo).

- [x] **0.5 The advertised `Alt+D` hotkey doesn't work on macOS** · S
  On a Mac, Option+D types `∂`, so `e.key === 'd'` never matches (verified by dispatching a real macOS-style event). The shortcut is advertised in 3 places (FAB tooltip, popover title, Brain Dump tip).
  *Where:* `app/ai-todo/page.tsx` (keydown handler). *Fix:* match `e.code === 'KeyD'`; skip when focus is in an input; consider a friendlier default key.
  *Done (2026-10-14):* matches the physical key (`e.code === 'KeyD'`, plus `key` `d`/`∂`); ignored while a dialog is open; the tooltip/popover/tip read *Option+D* on a Mac and *Alt+D* elsewhere.

- [x] **0.6 Number fields fight the user** · S `(code)`
  Start Day "Available Hours": clearing the field instantly snaps it back to `4` (`parseFloat(...) || 4.0`), so you can't type "6" without select-all. Quick Day Plan does the same with `|| 0`.
  *Where:* `StartDayModal` in `tasks/TaskTree.tsx`, the day-plan input in `quick/QuickDaily.tsx`. *Fix:* keep the raw string in state, validate on submit.
  *Done (2026-10-14):* Start Day and Quick Day Plan keep the raw text, accept 0.5–24 h with an inline hint, and Enter submits.

- [x] **0.7 Failures are silent** · M `(code)`
  Most plain edits swallow errors (`updateTask`, `deleteTask`, notes → `console.error` + `null`), and the UI either shows nothing or keeps the optimistic value with no rollback. Examples: `TaskDetailModal` field saves, `AddTaskModal` file upload (login-only → just stops), `CreateProjectModal`, `QuickEndDayModal` (null result → nothing), `Goals.handleMove` (no `catch`). The README already lists this as a known gap.
  *Fix:* every mutation reports failure through the shared Toast (1.4) and rolls back the optimistic change; show "Saved" / "Couldn't save — retry" in dialogs.
  *Done (2026-10-14):* the swallowing service methods in the todo / quick / project / goal services now call `reportFailure()` (`lib/services/mutationFeedback.ts`) → a toast with the real reason ("Your account is pending admin approval.", "Couldn't reach the server…"); identical repeats don't stack. Optimistic edits roll back (Quick time/due, Smart/Plan matrix moves); detail dialogs show *Saving… / Saved / Couldn't save · Retry* (selects snap back instead of offering Retry); Pareto re-score, project create, file upload and subtask add show their error; **End My Day no longer hangs** (it threw for guests and never cleared its spinner); completion confetti only fires after a successful save. **Not covered:** guest (IndexedDB) failures are still console-only.
  *Hardened after review:* deleting is idempotent (a double-click sends one request; a row that is already gone — a 404 — counts as deleted instead of raising "Task not found"); toasts raised while no `ToastHost` is mounted are dropped, so none reappears stale when you come back to the page; Quick Daily's refresh after Auto-Sort / a day plan runs silently, so it no longer unmounts a dialog you are typing in; a failed bulk-create keeps its preview so nothing has to be re-generated.

- [x] **0.8 Pending-approval banner overlaps the header (edge state)** · S
  For a user pending admin approval, the warning banner is drawn *over* the global header nav and the `h-screen` page ignores its height, so the bottom of the page (e.g. the Copilot input) is clipped. The to-do message itself ("Couldn't load your tasks — account pending approval") is good.
  *Where:* `components/common/Header` + `h-screen overflow-hidden pt-[60px]` in `app/ai-todo/page.tsx`. *Fix:* make the banner part of the layout flow, use `100dvh` minus real header height.
  *Done (2026-10-14):* the banner is now a strip fixed under the header; it publishes `--app-banner-h`, `body` pads by it, and full-height shells use `.h-app-screen` (and `.lab-shell`) to subtract it. Approved users: the variable is unset and nothing changes. Verified on desktop and phone, on To-Do and Config.

- [x] **0.9 A due date (or any "make this empty") can't be cleared when logged in** · M
  Found while testing 0.3 / 0.7. Every `PATCH` in `ai_todo` dropped `null` fields (`payload.model_dump(exclude_none=True)` in five FastAPI handlers, the same filter in their Next.js twins). The UI could say "empty" but the server heard "no change", so a due date, once set, could never be removed: `PATCH {due_date: null}` → 200 and the date unchanged. Logged-in only — guests were fine (the IndexedDB adapters spread the update over the record).
  *Done (2026-10-14), in both backends:* a field the client leaves out is untouched; a field sent as `null` is now written as NULL **only for columns that can be empty**, and ignored for required ones (`title`, `status`, `priority`, `done`, `quadrant`, … — `{title: null}` can't reach the database). FastAPI: `shared/patch.py` (`patch_updates`) + a `*_NULLABLE` set beside each update model (`tasks`, `quick`, `goals`, `projects` ×2). Next.js twin: `patchUpdates` in `fe-apis/todo/_shared.ts` + the same sets in `tasks/handlersCore.ts`, `quick/handlers.ts`, `goals/handlers.ts`, `projects/handlers.ts` (README documents the contract). The sets are identical in both languages; a node's `eisenhower_quadrant` is deliberately *not* in its set, because it reads back as `'schedule'` when NULL, so "clearing" it would claim success and change nothing visible. Side effect: `parent_id: null` now really moves a goal to the top level, and the Goals form can clear description / due date / parent.
  *Verified:* one API script run against both backends (31 checks each: every nullable field clears, every required field ignores `null`, `is_top_20: null` doesn't lock the Pareto flag, other users get 404, a wrong type is still 422) gives an **identical end state** on FastAPI and the twin; plus 26 browser checks that the Smart dialog, the Smart row's date/time chips, the Quick card chips, the Quick dialog, the project-node dialog and the Goals form all persist a cleared field after a reload. Text fields are still cleared with `''` (works on every server version); dates are cleared with `null`.
  *Kept on purpose:* `fieldsServerKept` (`ai-todo/shared/patchSemantics.ts`) still turns a "cleared" field that comes back set into a toast + snap-back, so a frontend deployed against an **older** backend (e.g. the Vercel build before the server is updated) says "Couldn't clear the due date" instead of claiming "Saved". Verified by stripping `null` from the request in a browser test.
---

## Phase 1 — Shared building blocks (build once, use everywhere)

- [x] **1.1 One accessible `Modal`** · M
  There is already a good one: `modules/ai-lms/ui/Modal.tsx` (`AbModal`: portal, `role="dialog"`, Esc, backdrop, focus trap + restore, scroll lock, `inert` page). Lift it to `components/ui/Modal.tsx` and migrate the ~14 hand-rolled overlays listed in 0.3. `grep createPortal` in `ai-todo` currently returns nothing.
  *Done (2026-10-14):* `components/ui/Modal.tsx` (+ `lib/ui/layers.ts` for the Esc/inert/scroll-lock stack). `ai-lms/ui/Modal.tsx` is untouched. Extras over the original: only the topmost layer reacts to Esc, initial focus goes to an `autoFocus`/`data-autofocus` field or the dialog itself (no phone keyboard pop-up), and it stops pointer events reaching dnd-kit draggables behind it (otherwise selecting text in a dialog drags the card).

- [x] **1.2 One `Menu`/`Popover`** · M
  For the status, priority, move and delete menus (TaskNode ×4, QuickTaskCard ×2). Portal + anchor positioning, click-outside, Esc, arrow-key navigation, closes other menus when one opens. `GoalCard`'s Move menu already closes on outside click — match or reuse it.
  *Done (2026-10-14):* `components/ui/Popover.tsx`, used by `TaskNode` ×4, `QuickTaskCard` ×2 and `GoalCard` ×1.

- [x] **1.3 One `ConfirmDialog` instead of native `confirm()` / `alert()`** · S
  **14** native dialogs: 9 × `confirm()` and 5 × `alert('Only .txt, .pdf, .docx files are supported')`. The 80/20 flow asks **twice in a row** ("already ran today" + "AI will analyze…") in 3 places (`SmartTodo`, `QuickDaily`, `PlanProject`; `ParetoSidebar` has the first prompt too) — make it one inline-explained step, no second confirm. Prefer undo over confirm for deletes (see 3.2).
  - [x] the 5 × `alert('Only .txt, .pdf, .docx…')` → toasts *(done 2026-10-14)*
  - [x] the 9 × `confirm()` → `ConfirmDialog` *(done 2026-10-14)*
  - [x] the double 80/20 confirm → one step *(done 2026-10-14)*
  *Done (2026-10-14):* `lib/ui/confirm.ts` — `confirmDialog()` returns a promise, so a call site changes from `if (!confirm('…')) return` to `if (!(await confirmDialog({ title, message, confirmLabel, tone })))` (it falls back to the native `confirm()` if no host is mounted, so a caller never silently proceeds) — plus `components/ui/ConfirmHost.tsx` (an `alertdialog` on `Modal`, mounted by the To-Do page next to the toasts: Esc and a backdrop click mean "no"; initial focus is on the safe answer — Cancel for a destructive question, the confirm button otherwise; the destructive confirm is red) and `shared/confirmPareto.ts`. The 80/20 question is now **one** dialog that says what will happen and, when it already ran today, adds that as a note in the same dialog; the Your 20% sidebar still only asks on a repeat. All nine `confirm()`s are replaced (three 80/20 flows × 2, the sidebar, deleting a goal, AI on a very deep item). Verified in the browser (51 checks); also gave the goal delete button an accessible name (9.3).

- [x] **1.4 One `Toast`** · S
  Three hand-rolled toasts with three different looks (Smart / Quick / Plan). They use `fixed top-20 right-6`, and `right-6` is **6 px** in this repo's spacing override, so toasts hug the screen edge. Quick's has no `role="status"` and single slot. `modules/ai-lms/ui/Toast.tsx` already exists (portal-based) — reuse/lift it. Needs: queue, auto-dismiss that cleans up timers, optional **Undo** action.
  *Done (2026-10-14):* `lib/ui/toast.ts` (plain store, so services can use it) + `components/ui/ToastHost.tsx` (mounted by the To-Do page; bottom-centre, lifted above the FABs on phones, pauses on hover, optional Undo action, doesn't stack repeats). The ai-lms toast was **not** reused: it is ai-lms-themed (`ab-*` tokens, framer-motion). All four hand-rolled toasts (Smart, Quick, Plan, ParetoSidebar) now use it.

- [x] **1.5 ~200 Tailwind classes silently render nothing** · M
  Opacity modifiers on theme tokens (`bg-primary/10`, `bg-muted/30`, `border-border/60`, `hover:bg-primary/90`…) generate no CSS here. **204 uses across 20 files** (verified against the compiled CSS). Effect: invisible selected states (e.g. the picked row in Start Day: `bg-primary/5 border-primary/45`), no hover tint on 11 primary buttons, no hover on Explorer rows, etc. Palette colors (`bg-amber-500/10`) do work.
  *Fix:* don't change `tailwind.config.js` globally (it would restyle other modules). Replace with the existing `todo-*` helper classes / `color-mix()` utilities, and add 2–3 small helpers (`todo-tint`, `todo-hairline`, `todo-hover`). Add a lint/grep check so new ones don't creep back.
  *Same trap, found during Phase 0:* size classes `w-/h-/max-h-` with 6, 12, 24, 36, 48… are **pixels**. Already fixed where they broke something (`max-h-48` subtask list, `w-36` Goal menu). Still wrong but cosmetic: every `w-6 h-6` loading spinner is 6px (×8 files), `w-12 h-12` in the Brain Dump spinner, `w-24` on the colour-swatch box in `CreateProjectModal` (wraps the dots one per row), and `space-y-6` / `gap-6` inside dialog bodies is 6px, which is why dialog sections look cramped.
  *Done (2026-10-14):* **(a) Dead opacity classes.** A new Tailwind plugin, `frontend/tailwind/mix-colors.js` (registered in `tailwind.config.js`), adds **`mix-bg-*`, `mix-text-*`, `mix-border-*`, `mix-ring-*`** utilities that take the same `/NN` modifier and compile to `color-mix()` — `mix-bg-muted/20`, `hover:mix-bg-primary/90`, `placeholder:mix-text-muted-foreground/60`. They are *new class names*, so nothing that already exists changes and no other module is restyled (the thing the checklist warned about). A codemod rewrote **209 of the 210 dead uses in 23 files** of the To-Do area (the 210th, a gradient stop, was done by hand); the visual change is subtle — borders at their intended strength, the section dividers in dialogs, hover and selected tints that never showed. **(b) The pixel-spacing trap.** All **42** pixel-valued classes in the To-Do area now say what they meant, as rem: the spinners (`w-6 h-6` was 6px → `w-[1.5rem] h-[1.5rem]`), dialog section spacing (`space-y-6` was 6px → `space-y-[1.5rem]`: the task dialog now has room to breathe), modal paddings and empty states (`p-6`, `py-12`), the colour-swatch box (`w-24`), the custom-days input (`w-24` = 24px wide!), and the capture input's `pr-36`, which reserved 36px for its buttons instead of 144px so typed text ran underneath them. **(c) A guard.** `npm run check:tailwind` fails on either trap in the To-Do area and prints the exact fix (`bg-muted/20 → mix-bg-muted/20`, `px-6 → px-[1.5rem]`); `-- --all` reports the rest of the app. **Still open outside the To-Do area:** the same traps exist elsewhere — about **2,500 uses** (AI-LMS 425, career studio 279, question review ~400, question bank ~290, admin 179, common 173…). They were left alone because fixing them restyles those modules; the `--all` report is the to-do list if you want it. *Found while verifying:* with 40px touch targets (1.8) the Quick card's six action buttons are wider than a phone, so they now wrap inside the card instead of spilling out of it.

- [x] **1.6 One icon system** · M
  ~30 different emoji are used as UI icons (⭐ ×13, 🧠 ×11, ⚠ ×10, ⚡ ×9, 🗺 ×7, 📁 ×7…) next to Heroicons. They look different per OS, can't be recolored (the ⚫ "Eliminate" dot vanishes in dark mode), and some buttons are emoji-only with no label (🧠 / 🌅 in the Quick capture bar). Use `Icon` everywhere; keep emoji only where the user picks one (project icon).
  *Done (2026-10-14), with the icon set you asked for — **react-icons' Flat Color icons** (`react-icons/fc`, installed as a dependency):* a new `components/ui/FlatIcon.tsx` draws the illustrations that were emoji. Components say what an icon **means** (`<FlatIcon name="star" />`, `idea`, `folder`, `brain`, `quick`, `calendar`, `warning`…), and one registry maps meanings to icons, so swapping an icon is a one-line change. The rule, written in the component and in `config.js`: **flat colour icons for illustrations and labels, the outline Heroicons (`Icon`) for plain controls** (chevron, close, plus, trash, arrows, the per-row star), so controls still follow the text colour and don't turn every row into a rainbow; **no emoji**, except the icon a user picks for a project. The inventory found **133 emoji uses (49 distinct) in 13 files**: ⭐ 📌 🧠 ⚡ 📁 💡 🗺️ ⚠️ 🤖 🔍 📅 🗑 🤝 🌅 🎯 📝 📸 🌙 🏆 🌵 🤔 🎉… all replaced; the colour-dot emoji in the matrix (🔴🔵🟡⚫ — the ⚫ vanished in dark mode) and the priority options became real CSS dots or plain text (native `<option>`s can't hold an icon); the Plan guide text no longer names emoji that no longer exist; ✕ and ↺ became Heroicons; the 🧠/🌅 buttons keep their accessible names. Projects: `ProjectIcon` shows the flat folder for the default icon (new projects are saved with 📁) and the user's own emoji for anything they picked — the 10-icon picker in *New Project* is the one place emoji remain (and its buttons now have names and `aria-pressed`). **Verified:** a test walks every tab, dialog, menu and drawer (16 views) and fails on any emoji glyph in text, labels, titles, placeholders or options; flat icons are present and hidden from screen readers; the picked 🚀 still shows; and in dark mode the Eliminate marker contrasts with the background (28 checks). `npm run check:tailwind` now also fails on an emoji used as an icon (mark an intentional one `emoji-ok`).

- [x] **1.7 Text-size floor** · M
  **260** uses of `text-[8px]…text-[11px]` vs 228 at 12–14px. Quick task titles are **11px**, their meta chips 10px, many badges 8–9px. Rule: anything you read to decide something ≥ 12px (titles 14px); 10–11px only for decorative labels.
  *Done (2026-10-14), at the **comfortable** density you chose:* the floor is **12px for everything you read, 14px for titles, and 11px only for uppercase caption labels** (STATUS, PRIORITY, DEPTH…). **242** uses of `text-[8px…11px]` in 26 files were rewritten (111 × 10px and 44 × 11px → `text-xs`; the 54 uppercase captions → 11px; the 3 remaining 13px titles → `text-sm`), plus the shared helpers: `.todo-chip` 10px → 12px and the Copilot prompt chips 11px → 12px. The Quick cards and the capture bar were already built at 14 / 12px (4.1). The Task Copilot panel's subtitle, found by the test, is included. **Verified three ways:** an overflow sweep (0 horizontal overflow and no new clipped element on any To-Do route, desktop and phone), before/after screenshots of every tab and dialog, and a test that walks every visible text node in the To-Do surfaces — tabs, dialogs, menus, drawers — and fails below the floor (23 views × desktop and phone). `npm run check:tailwind` now also flags `text-[10px]`-style sizes, so they can't creep back. Not done: the rest of the app outside the To-Do area (use `-- --all` to list it).

- [x] **1.8 Touch-sized targets** · S
  Task checkbox hit area is 24×24 on phones, chevrons 12px, icon buttons ~20px. Under `@media (pointer: coarse)` make interactive targets ≥ 36–44px.
  *Done (2026-10-14):* **measured first** — on a touch-emulated phone (390×844, `pointer: coarse`) a script listed every interactive element under 40px across the four tabs, their dialogs, menus and drawers: ~200 of them, from the 12×12 tree chevron and 24×24 checkboxes to 16px-high chips, 25px inputs and 30px dialog ✕ buttons. One rule in `tailwind.css` (`@media (pointer: coarse)`, scoped to `.todo-shell`, dialogs, menus, toasts and the global header) now gives every button, checkbox, menu item and tab a **40×40 minimum**, and every select / text input a 40px height. It is **real size, not an invisible tap halo**: neighbouring halos overlap and a tap lands on the wrong control (the checkbox next to a chevron). A mouse is untouched (desktop sizes unchanged — tested). Follow-ups it needed: leaf rows keep a spacer as wide as the chevron so checkboxes stay aligned; the two checkbox *labels* (Recurring, Add Task) get a 40px minimum; and the **Smart task row now wraps** — the trailing badges / status / priority / details group drops under the title on a narrow screen, because 40px targets would otherwise squeeze the title to ~100px ("Plan the product…"). Re-audited: **0 targets under 40px** in 25 views; 26 checks. (The one dialog the script couldn't click, the inbox FAB, was covered by Next's dev-only overlay, not by the app.) Rows are taller on a phone until 3.1 (calm down the task row) removes controls.

- [x] **1.9 Real buttons instead of clickable `div`s** · S
  `GoalCard` root (`onClick` on a `div`), `ProjectCard` body, Start Day suggestion rows (`div onClick` + read-only checkbox), the Brain Dump drop zone — none are keyboard-operable.
  *Done (2026-10-14):* found every non-interactive element with an `onClick` in the To-Do area with the TypeScript compiler (a regex misses multi-line tags) and fixed each: the **Goal card's title is a real `<button aria-pressed>`** (Enter / Space select it; a click anywhere on the card still does, so the pointer behaviour is unchanged — the title has no handler of its own, its click bubbles); the **ProjectCard body is a `<button>`**; the **"Your 20%" header is a real expand/collapse button with `aria-expanded`/`aria-controls`** (plus a named chevron button, and *Re-analyze* no longer needs `stopPropagation`); the **Brain Dump drop zone** is `role="button"` with Enter/Space opening the file picker; the **Plan matrix cards** are `role="button"` (Enter/Space open their project; the drag keyboard guard still ignores keys from inside the card); and the **Start Day suggestion / alternative rows are `<label>`s around real checkboxes** (they were a `div onClick` over a read-only checkbox). What's left in the scan is deliberate: the Goal card root's pointer handler, a click-swallowing wrapper, and `aria-hidden` backdrops. Verified by keyboard in the browser (24 checks).

- [x] **1.10 One clean font everywhere — Montserrat; no mono, script or "coder" fonts** · M *(added at your request, 2026-10-14)*
  The UI was set in Inter + Plus Jakarta Sans, with Fira Code (a coder font) used for numbers, badges, ids, timestamps, form fields and hints in ~60 places. You asked for clean, designed fonts like Montserrat **throughout the application**.
  *Done (2026-10-14):* the design-system tokens in `frontend/config.js` now set `sans` **and** `display` to **Montserrat** (400–800, loaded by the one Google Fonts import in `tailwind.css`, which no longer loads Inter / Plus Jakarta Sans). Monospace is reserved for real code only — `<code>`, `<pre>`, and the editors for code / JSON / HTML (the career job-match JSON boxes, the AI-LMS landing/lesson HTML editors, the Config env-file snippet, the swipe-learn code card). Everything else moved to Montserrat: numbers use `tabular-nums` so digits still line up; ids/timestamps in the task dialogs, the session progress, Question Bank and Question Review figures, AI-LMS badges / lesson numbers / progress %, the Config page's API-key and URL fields, swipe-learn tags, the OCR text in Brain Dump, and the progress charts (which named a font that was never loaded — they now inherit). `<kbd>` and `<samp>` no longer fall back to Tailwind's system mono. The `config.js` header now states the rule so it isn't undone later.
  *Verified:* a sweep of 20 routes × 2 viewports (desktop 1440 and phone 390), before and after — body font Montserrat on every route (and the faces really loaded), **0** leaked mono text elements (19 before: AI-LMS 10, Question Bank 4, Swipe 4, Config 1), no horizontal overflow, and the clipped-element lists are identical on all 40 combinations, so the wider font caused no new clipping. **Left alone on purpose:** the AI-LMS editorial theme (`ab-theme`: Cormorant Garamond headings + Montserrat, its own design), the career-studio portfolio / resume templates (their own fonts are the product), the generated lesson HTML under `ai-lms/classes/`, and the system sans inside the lesson preview iframes. Say the word if you want the LMS serif headings changed too.

---

## Phase 2 — Page frame & navigation

- [ ] **2.1 Put the tasks above the fold** · M
  With 9 tasks at 1440×900 the first card starts at **y = 785**; only 1 card is fully visible without scrolling (cards average 114 px, so even then ~7 per screen). ~725px of chrome sits above the list: page title + tagline (~110) → 4-tab bar (~70) → AI Fast Capture + hint (~80) → view switch (~50) → three stat cards (~180) → "Tasks" header (~50) → search/filters (~55).
  *Fix:* one-line page header (or drop the tagline); fold the 3 stat cards into one slim strip ("2 / 3 today · 🔥 1-day streak · 7-day bars on hover"); merge the view switch with search/filters; target: first 4–5 tasks visible on a 900px screen.

  ```
  ┌ Tabs: Quick │ Smart │ Plan │ Goals ─────────────── [Inbox 3] [Copilot] ┐
  │ [✨ Add a task…  (Enter)                          ] [+ details]        │
  │ Today 2/3 · streak 1 · 2 due/overdue     [Tree│List│Focus] [🔍] [Filters]│
  │ ☐ Draft system design notes    due today   P1   ⋯                      │
  │ ☐ Review pull requests         2d overdue  P2   ⋯                      │
  ```
  *(layout sketch for discussion, not a spec)*
  *Partly done (2026-10-15, Smart To-Do):* the three stat cards are now one row of small tinted tiles (Today / Streak / 7 days), the header and tabs lost ~110px, and the glowing capture / stats / alert boxes are gone. At 1440×900 the first task row starts at y≈620 with about 3 rows visible (before: no row on the first screen); on a 390×844 phone the first row starts at y≈680 (before: none). Not done: merging the view switch with search/filters, and the 4–5-rows target.

- [ ] **2.2 One way to add a task** · M
  Smart To-Do has four entry points: AI Fast Capture bar, "New Todo" inline row, the bottom-right **+** FAB (opens the full form), and the bottom-left Distraction FAB. Keep **one always-visible capture bar** (Enter adds, keeps focus) with a "+ details" expander; drop the inline row and the **+** FAB on desktop.

- [ ] **2.3 Floating buttons cover content** · S
  The bottom-left Distraction FAB overlaps the left edge of cards (and on phones their checkboxes); the bottom-right **+** overlaps the status/"···" of the last visible row; on phones the amber FAB collides with the global ⚡ button. *Fix:* move Distraction Inbox into the page header (inbox icon + count badge) or the capture bar; no floating buttons over the list.
  *Partly done (2026-10-15):* both buttons are 40px and calmer (the amber inbox button is neutral; the **+** stays violet), the **+** only appears once the header's "New Todo" has scrolled out of view, and from lg up the page keeps a gutter beside the Copilot so the **+** never covers a task row. Still open: on phones both buttons can sit on top of a row's checkbox or "···" — needs Decision 5 (move the inbox into the header, drop the floating buttons).

- [ ] **2.4 Tab/sub-view/project state is lost and history is noisy** · M
  Switching tabs resets search text, filters and expanded nodes (verified: search "refactor" → Quick → Smart → empty). Every tab click `router.push`es, so **Back walks through tabs** instead of leaving the page. Sub-view is in the URL for Plan (`?view=`) but not for Smart. The Project Explorer isn't in the URL: **Back leaves the page and a refresh closes the project**.
  *Fix:* `router.replace` for tab/sub-view changes; keep filters/search in page-level state (or `sessionStorage`); add `?project=<id>` for the Explorer; drop stale `view=` when changing tab.

- [ ] **2.5 Default tab vs tab order** · S
  Landing tab is `smart`, but the bar starts with Quick Daily. Pick one landing tab on purpose and remember the last-used tab (`localStorage`). See "Decisions".

- [ ] **2.6 Copilot panel: closed by default, reachable on mobile** · M
  It is open by default and takes **320 px (22%)** of a 1440 screen. For guests it is mostly inert (login prompts + 6 prompt chips that need AI). Below 1024px it doesn't exist at all — no Copilot **and no Local/Online switch** (the model state lives only there).
  *Fix:* default collapsed (remember the choice); open it from a header button as a drawer on small screens; move the Local/Online switch to a small header control or Config; guest-friendly empty state.

- [x] **2.7 Page header** · S
  "AI To-Do — Break tasks infinitely deep with AI · Track progress · Stay productive" uses ~110px for a tagline. Make it one line or remove (also fixes 2.1). Tab hints ("— Fast daily execution") repeat the tab name's meaning; show them as tooltips.
  *Done (2026-10-15):* the header is a title plus one quiet line ("Capture, plan and finish tasks with AI."), no icon tile and no tagline. The four tabs are plain text over a hairline with the current one underlined; their descriptions stay as tooltips. A very faint violet wash behind the title is the only gradient on the page.

---

## Phase 3 — Smart To-Do (tasks)

- [ ] **3.1 Calm down the task row** · L
  A bare task shows ~10 interactive controls (checkbox, title, status, priority, "···", notes icon, "Add time", "Add date", Dive Deeper, Chunk It, + the L1 badge) and up to ~16; rows are 114px tall (127px on phones), ~7 per screen. *Fix:* default row = **checkbox + title + due chip (if set) + priority dot + progress (if it has children)**. Show time/date placeholders, notes, "···" on hover/focus/selection; fold Dive Deeper + Chunk It into one **✨ Break down** menu; hide the `L1` badge unless depth > 1; add a **Compact / Comfortable** density toggle.
  *Where:* `tasks/TaskNode.tsx`.
  *Partly done (2026-10-15):* a row is open (no card, no coloured depth border, pill or glow): checkbox, title, status and priority as a coloured dot + text, and due / time / progress on a quiet second line. "Add time", "Add date" and an empty notes counter show on hover or focus (after "···" on phones); the level tag only appears below L1, with a tooltip. On phones a row is a title plus one plain-text summary line, and the status / priority / date controls, Dive Deeper / Chunk It, notes and context sit behind "···". Depth is now drawn as a 3px coloured rail per row (see the notes at the bottom). Not done: folding Dive Deeper + Chunk It into one menu (they stay visible, quiet, text-only), hiding the status at rest, and the density toggle.

- [ ] **3.2 Completed tasks stay mixed into the list forever** · M
  Checking a task keeps all rows in place (16 → 16). *Fix:* auto-group into a collapsed **"Completed (n)"** section at the bottom (or "Hide completed" toggle), strike-through + fade, and a toast with **Undo**. Also: unchecking resets status to *Backlog* even if it was *In Progress* (`handleCheckbox`) — restore the previous status. Prefer Undo over the 3-click delete flow ("···" → trash → confirm).

- [ ] **3.3 Add a subtask where you are** · M
  There is no inline "add subtask" on the row; it only exists inside the detail dialog. For guests (Dive Deeper/Chunk are AI-only) that is the *only* way to nest, which undercuts "infinitely nestable". Add a `+` on row hover and keyboard flow (Enter = add sibling, Tab = make child). Project Explorer already has an inline "+ Subtask" — match it.

- [ ] **3.4 Eisenhower Matrix is hard to use** · M
  Tasks start unsorted, and the **Unassigned tray sits ~500px below the four empty quadrants** (y ≈ 909 vs quadrants at 416), so the first thing you see is four empty boxes. Cards are `pointer-events-none` with no-op handlers: you **can't complete, open or edit** a task from the matrix. Quadrants are ~240px tall each. Subtasks are flattened in as separate cards.
  *Fix:* show the Unassigned tray first (top/left), let cards be completed/opened, fixed-height quadrants with inner scroll, a "Move to…" select on each card (needed for guests and touch; AI Auto-Sort is login-only).

- [ ] **3.5 Weekly Plan is a dead end** · M
  Login-only (guests discover that after clicking `(code)`), read-only, **not saved** (gone on refresh — the README admits this), Mon–Fri only, and tasks can't be accepted or dragged. *Fix:* gate with an up-front login hint; persist the last plan; "Apply" sets due dates; include the weekend or let the user choose days.

- [ ] **3.6 Editing affordances are hidden or awkward** · M
  Rename = double-click (only a tooltip says so); time estimate is free text ("30 mins"); due date is a bare `<input type="date">` that saves on blur. *Fix:* click-to-edit title, Enter/Esc; date chip → popover with **Today / Tomorrow / Next week / Pick**; estimate chip → presets (15m, 30m, 1h, 2h, custom). Esc cancels without saving.

- [ ] **3.7 Task detail dialog polish** · M
  Shows the internal id ("Task #12"); subtask list is read-only with raw enum text (`IN_PROGRESS`) and no checkbox/open/delete; notes show raw timestamps, and a newly added note goes to the bottom here but to the top in the row's notes panel `(code)`; fields auto-save on blur with only a "Saving…" label (no "Saved", no error); native `<select>`s differ from the row's custom menus; 💡 🎯 📝 emoji labels (1.6).
  *Where:* `tasks/TaskDetailModal.tsx`.
  - [x] auto-save feedback: *Saving… / Saved / Couldn't save · Retry* instead of a bare "Saving…" *(done with 0.7)*
  - [ ] the rest: internal id, raw enum text, read-only subtask list, note order and timestamps, native selects, emoji labels

- [ ] **3.8 Start Day / End Day flows** · M
  "Start Day" is AI-only — guests enter hours and then get an error. Offer a manual "pick today's tasks" mode that works without AI (AI curate is the enhancement). Suggestion rows are `div onClick` with a read-only checkbox (1.9). End Day is good; add what will happen to each choice in plain words.

- [ ] **3.9 Filters** · S
  "Top 20%" lives with the filters while "80/20 Analyze" lives in the view row — group them. Show active filters as removable chips under the search, remember them (2.4), add `/` to focus search. `ChipGroup` is defined inside `FilterBar`'s render, so it remounts on every render (hoist it) `(code)`.

- [ ] **3.10 "Due today & overdue" box** · S
  A good feature. Make rows in it clickable (scroll to / open the task) and collapsible; today it only lists names that are also shown again further down.

- [ ] **3.11 Reward loop (cheap delight)** · S
  Confetti fires **30 particles on every completion** and ignores `prefers-reduced-motion`. Reserve it for milestones (daily target hit, Top-20% task, project step) and honor reduced motion; make ordinary completions a quick satisfying strike/slide. Show progress in the tab title (`(2/3) AI To-Do`). The daily target is hard-coded to 3 (`DAILY_TARGET`) — make it editable.

---

## Phase 4 — Quick Daily

- [x] **4.1 Every task be shown twice** · M
  Matrix and "Today's List" render the same tasks side by side (every title appears 2× on screen), doubling noise, DOM and state. Make the **list the default** (check off, reorder, quick-prioritise) and the matrix an optional **Prioritise** view/toggle.
  *Done (2026-10-14):* Quick Daily opens on **List** — *Unsorted* first, then Do now / Schedule / Delegate / Eliminate as sections you can drag cards between (by a grip only, so the list still scrolls under a finger). Each row has a check box, a **quadrant chip** (tap it to sort — no dragging needed) and its actions. **Prioritise** (the Eisenhower matrix, Unsorted tray first) is a toggle beside it, and the choice is remembered. One view renders at a time, so every task is on screen — and in the DOM — once (4 tasks = 4 cards, it was 8). The toolbar now carries *List | Prioritise*, Top 20%, 80/20 Analyze, AI Auto-Sort, progress ("3 of 8 done · Wednesday, October 14" with a bar) and End My Day. Built by letting the shared `EisenhowerMatrix` render as a stacked list (`layout="stack"`, `unassignedFirst`, `allowUnassign`, `showHeader={false}`); Smart and Plan are unchanged because every new prop defaults to the old behaviour. **Found while testing:** a row that appeared on hover changed a card's height, so the card below it slid away from the pointer and its drag grip couldn't be grabbed — chips now exist only when there is a value, and *add time / add date* fade in (opacity) instead of appearing (layout).

- [x] **4.2 New tasks always land in "unsorted list from there i can categorise"** · S
  send All  test tasks went to a list from there i can organise in quadrants; t. *Fix:* add to an **Unsorted List** state by default, or let the capture bar pick a quadrant (chips), or default from due date/time. or user can pick and drop in quaderant
  *Done (2026-10-14), FastAPI + `fe-apis` + guest storage:* a new quick task starts **`unsorted`** (a plain string, not NULL, so an older server that only knows the four quadrants still stores it, and a `null` create would not 422 there) from every entry point — the capture bar, Brain Dump, and moving a task in from Smart, a goal or a plan step. Sort it by dragging (list or matrix), by the **quadrant chip** menu, or choose **Add to:** in the capture bar before adding (it resets to Unsorted after each add); a card can be sent back to Unsorted the same ways. **AI Auto-Sort** now sorts the *unsorted* tasks only, so a quadrant you chose by hand is never overwritten (when nothing is unsorted it re-sorts everything, so the button still does something); it also refuses model answers for tasks it wasn't asked about or values that aren't real quadrants, and accepts string ids (`backend/modules/ai_todo/quick/auto_sort.py` ↔ `fe-apis/todo/quick/autoSort.ts`, pure and testable). Tasks that already exist keep the quadrant they have. **Verified:** 25 API checks run identically on FastAPI and the Next.js twin against a fake local model (no real AI, provider keys blanked) with an identical end state; 54 browser checks (list/matrix, chip, drag, persistence, a phone, guest mode).

- [ ] **4.3 Capture bar** · M
  Emoji-only icon buttons (🧠 brain-dump, 🌅 day plan) with no labels; on phones they cover the placeholder ("…(hit En"); Time and Due Date are a second row with a native `dd/mm/yyyy` date input that wraps; "Top 20%" and "80/20 Analyze" are 10px buttons. *Fix:* labelled toolbar buttons; Time/Due as optional chips that appear on focus; parse "30m", "tomorrow", `#p1` in the title text so no extra fields are needed.
  - [x] the two icon-only buttons and the submit arrow now have accessible names; the options strip is 12px with real labels, and gained an **Add to:** quadrant choice *(done 2026-10-14, with 4.2)*
  - [ ] visible labels instead of emoji; Time/Due as chips; the phone overlap; `30m` / `tomorrow` / `#p1` parsing

- [x] **4.4 Card controls vanish on touch** · S
  The time/due meta row of a bare quick task is `display: none` until hover, so on a phone you **can't set a time or due date** (and the detail dialog is broken, 0.1). Show chips always on touch, or open a bottom sheet on tap.
  *Done (2026-10-14):* *add time* and *add date* are small icon buttons that fade in on hover/focus on a desktop pointer and are **always visible on touch screens** (`@media (hover: none)`); the chips row only appears when a task has a value. Verified at 390×844 with touch emulation.

- [ ] **4.5 Drag-and-drop on phones** · M
  Desktop drag works (verified). But every matrix card has `touch-action: none`, so swiping over a card **never scrolls the page**, and there's no non-drag alternative. *Fix:* TouchSensor with a long-press delay + a visible drag handle, and a "Move to quadrant" menu item.
  - [x] the default **List** view: only the grip has `touch-action: none` (the list scrolls under a finger), and the **quadrant chip** menu is the non-drag way to move a task *(done 2026-10-14, with 4.1)*
  - [ ] the **Prioritise** (matrix) view, and the Smart / Plan matrices: cards are still `touch-action: none` — needs a grip or a long-press TouchSensor there too

- [ ] **4.6 "Today's List" header** · S
  Says "Today" with no date; progress is "0 of 6 done" in 10px; **End My Day** is a 10px button in the header. Add the date, a progress bar, and make End My Day a clear footer action once something is done.
  - [x] the date, a progress bar, and 12px+ text; End My Day is a normal-sized button in the toolbar *(done 2026-10-14, with 4.1)*
  - [ ] End My Day as a clear footer action once something is done

- [ ] **4.7 Day Plan result is a dead end** · S
  The only button is "Close"; the plan isn't saved or applied. Add **Apply to today** (order/mark tasks) and show time used vs available hours.

- [ ] **4.8 "Moved out" list** · S
  Struck-through 9–10px lines with no way back. Add "Undo move".

---

## Phase 5 — Plan & Project

- [ ] **5.1 Replace the how-to banner** · S
  Each sub-view opens with a 4–8 step manual (emoji standing in for the real icons) above your content; on phones it fills the first screen. Use good empty states + tooltips; if kept, show once and **remember dismissal**.

- [ ] **5.2 Project cards** · M
  Titles truncate ("Launch personal …") because the % ring takes the corner. That ring is the share of nodes **exported to tasks, not completed** (README "known gap") — misleading; label it or compute real completion. The card body is a `div onClick` (1.9). Delete sits beside Explore/Roadmap at equal weight — move it into a "···" menu with undo.

- [ ] **5.3 Explorer rows are a wall of buttons** · M
  Every node shows 7 permanent buttons at 10px (Details, Subtask, Dive Deeper, Chunk It, →Smart, →Quick, trash). Reveal on hover/focus; group the two AI buttons under ✨ Break down and the two exports under "Send to ▾"; show the node's own info (type, due) more clearly.

- [ ] **5.4 Explorer isn't addressable** · S
  See 2.4 (`?project=`). Also the "Back to projects" control is an icon-only arrow.

- [ ] **5.5 Roadmap view** · S
  Requires choosing a project from a dropdown even when there is only one; keeps "New Project" and "80/20 Analyze" in the header though they don't apply; AI-only generate button is shown to guests with no explanation (7.1) `(code)`.

- [ ] **5.6 Project matrix** · S
  Same issues as 3.4 (unsorted tray first, cards actionable).

- [ ] **5.7 Create Project dialog** · S
  Silent when creation fails (0.7); color swatches are 16px dots (touch, 1.8); migrate to Modal (1.1).
  - [x] migrated to Modal (1.1) *(done 2026-10-14)*
  - [x] creation failures are shown (0.7) *(done 2026-10-14)*
  - [ ] colour swatches are 16px dots, and the box holding them is `w-24` = 24px so they wrap one per row (1.5 / 1.8)

- [ ] **5.8 Phone layout** · S
  The Projects / Matrix / Roadmap switch overflows ("Roadmap" is clipped); "80/20 Analyze" collapses to an unlabeled ★.

---

## Phase 6 — Goals

- [ ] **6.1 Empty state is four calls to action** · S
  New Goal button + "Start with what matters" banner + six empty horizon cards, each with its own "Add X". Show **one** empty state until there is a goal; keep per-horizon "+" afterward. Copy bug: "No **main goal goals** yet" (the other horizons read fine).

- [ ] **6.2 Card actions are hidden behind an unlabeled chevron** · S
  The chevron doesn't read as "actions" (use "···"); edit/delete are icon-only; delete uses native `confirm()` (1.3); `handleMove` has no error handling (0.7).
  - [x] `handleMove` error handling and rollback (0.7) *(done 2026-10-14)*
  - [ ] chevron → "···", labelled edit/delete
  - [ ] native `confirm()` on delete (1.3)

- [ ] **6.3 Selection highlight** · S
  Clicking a card dims everything unrelated (nice idea) but nothing says so and it isn't keyboard-reachable (1.9) `(code)`. Add a hint + a "clear selection" control.

- [ ] **6.4 Phone layout** · S
  Six stacked empty cards; the FAB covers content (2.3).

---

## Phase 7 — AI & guest experience

- [ ] **7.1 Don't show guests controls that will fail** · M
  AI is login-only on purpose (don't add guest fallbacks for AI). But the UI shows every AI control as if enabled and errors *after* the click: **Dive Deeper + Chunk It on every row**, Brain Dump (opens a full upload dialog first), Start Day, Weekly Plan, Day Plan, 80/20 Analyze, Auto-Sort, Copilot prompts, AddTask "Suggest" and file upload (silent, 0.7). Verified message: "Log in to use this feature." plus a 401 in the console.
  *Fix:* one `useAiGate()` helper: lock badge + tooltip ("Log in to use AI"), click opens the login flow, no request is sent.

- [ ] **7.2 Model switch (Local / Online) is buried in the Copilot panel** · S
  See 2.6. Also `AddTaskModal` hard-codes `'gemini'` for "Suggest" and ignores the chosen model `(code)`.

- [ ] **7.3 Undo everywhere** · M
  The 10-second "AI subtasks generated — Undo" pattern is good. Extend it to complete, delete, move, and Day Plan changes via the shared Toast (1.4).

---

## Phase 8 — Mobile & touch (items not listed above)

- [ ] **8.1 Hover-only information** · S
  Intention / Definition-of-Done previews and Quick meta chips only appear on hover. Show on tap or inline.
- [ ] **8.2 Header wrapping on phones** · S
  "Eisenhower Matrix — drag cards…" wraps onto 3 lines next to the AI Auto-Sort button; the Due Date label wraps in the capture bar.
- [ ] **8.3 Also apply:** 1.8 (targets), 2.3 (FAB collisions), 2.6 (Copilot drawer), 4.3–4.5, 5.1, 5.8, 6.4.

---

## Phase 9 — Accessibility

- [x] **9.1** Dialog semantics, focus handling, Esc → 0.3 / 1.1. *Done (2026-10-14):* every dialog is a `role="dialog"` `aria-modal` Modal with a focus trap, focus restore and Esc.
- [x] **9.2** Status/priority menus declare `role="menu"` but have no arrow-key navigation or Esc (1.2). *Done (2026-10-14):* `Popover` handles ↑ ↓ Home End, Esc, outside click and returns focus to the trigger.
- [ ] **9.3** Icon-only buttons rely on `title` alone (Quick card ⭐ / move / delete / checkbox, GoalCard chevron, dialog ✕, project delete). Add `aria-label`. Quick card checkbox has no role/label (TaskNode's is fine).
- [x] **9.4** Contrast: measured light + dark. Almost everything passes (4.65–8.7:1). **Fails:** success text "Added “…”" in light theme = **4.22:1** (11px), and the "Backlog" status badge in dark theme = **3.47:1**. Fix those two; don't assume the rest is fine at 10px (1.7). *Done (2026-10-15):* the Smart row's status is plain muted text (8:1, no pill) and the light-theme success token is darker (5.5:1); re-measured after the colour pass, lowest coloured text is 4.6:1 (light) / 6.3:1 (dark).
- [ ] **9.5** Hover-only popovers for Intention/DoD aren't reachable by keyboard or touch (8.1).
- [ ] **9.6** Reduced motion: `todo-*` CSS already honors it — extend to confetti (3.11) and the card lift (0.1).

---

## Phase 10 — Performance & robustness

- [ ] **10.1 One notes request per task row** · M
  Logged-in load with 16 task cards made **39 API requests, 32 of them `/todo/tasks/:id/notes`** (2× per row in dev because Strict Mode double-fires effects → ~16 in production, still the vast majority; the rest of the page needs 7). Every `TaskNode` fetches its notes count on mount and whenever the task updates.
  *Fix:* return `notes_count` inside `/todo/tasks/tree` (and the `fe-apis` twin, plus the guest adapter), and fetch notes only when the notes panel opens.
- [ ] **10.2** Each row mounts a (hidden) `TaskDetailModal` and `ParetoModal`; mount them on demand (also needed for 0.1).
- [ ] **10.3** Quick Daily renders every card twice (4.1), plus a full card inside the drag overlay.
- [ ] **10.4** Project Explorer reloads the whole tree after every add/delete (`loadTree()`); update local state instead.
- [ ] **10.5** No list virtualization — fine today; revisit around 200+ tasks.

---

## Phase 11 — Copy & microcopy

- [ ] **11.1** "Parse & Add" (jargon; for guests it only reads `#p1–#p4`) → "Add". "Chunk It" / "Dive Deeper" → plain names with a one-line tooltip each ("Break into small steps" / "Explore sub-topics"). "Lock In", "Node #2", "Task #12" → user words / hide ids.
- [ ] **11.2** Consistent names: "To-Do" / "Todo" / "Task"; "Quick Daily" vs "Today's List"; unify "Backlog" (every new task starts as *Backlog*, which reads like a pile — consider "To do").
- [ ] **11.3** Show raw enums as labels (`IN_PROGRESS` → "In progress").
- [ ] **11.4** Empty states: keep the warm ones ("Your next accomplishment starts here"); fix "No main goal goals yet"; every empty state ends with one clear action.

---

## Decisions needed (don't block Phases 0–1)

1. **Quick Daily vs Smart To-Do overlap.** Both are task lists; "Move to Quick / Smart / Plan" menus exist in three places. Keep two tabs but sharpen their jobs (Quick = **today**, Smart = **everything**), or merge into one "Tasks" with a Today lens?
2. **Landing tab** — which view should open by default (and remember last-used)?
3. **Default density** — compact or comfortable (3.1)? **Decided (2026-10-14): comfortable** — easy to see, easy to read, easy on the eyes, easy to use. Compact stays available as an opt-in toggle (3.1), never the default. This also sets the bar for 1.7 (no tiny text) and 1.8 (generous touch targets).
4. **Status model** — 5 statuses (Backlog / In Progress / Delayed / Done / Not Done) is heavy for personal use; reduce to To do / Doing / Done (+ Blocked)?
5. **Floating buttons** — OK to remove them entirely in favor of header actions (2.2, 2.3)?

---

## What already works — keep it

- Capture box: Enter adds, focus stays, "Added “…”" confirmation, text kept on failure.
- Actionable error panels with **Try again** (task load error, pending-approval message).
- "Due today & overdue" panel, streak/daily-target stats, the 10-second AI undo.
- Project Explorer: inline add with focus retention, Expand/Collapse All, inline "+ Subtask".
- `AddTaskModal` (dialog semantics, Esc, double-submit guard) — use it as the model for 1.1.
- Dark-mode parity, `prefers-reduced-motion` handling in the `todo-*` CSS, guest mode working fully offline for manual CRUD (IndexedDB).

---

## Notes for whoever implements this

- **Tailwind traps** (`tailwind.config.js` is shared, don't change it globally): opacity modifiers on theme tokens compile to nothing (1.5); spacing keys `6, 12, 18, 24, 36, 48, 72, 96, 144` are **pixels** (`px-6` = 6px, `right-6` = 6px) — use arbitrary values (`px-[1.5rem]`).
- **Guests** use IndexedDB adapters (`lib/services/local/`). Any new manual-CRUD method needs the guest branch too. AI stays login-only.
- **Two backends:** a change to an `ai_todo` endpoint (e.g. `notes_count`, 10.1) must also go into `frontend/fe-apis/todo/` and the local guest adapter. Pure UI work needs no API parity.
- Edit `ai_todo` / `ai-todo`, **not** the dead `todo/` folders. Use `apiFetch`, never bare `fetch`.
- **Overlays:** use `components/ui/Modal` (dialogs) and `components/ui/Popover` (menus / confirm bubbles); never render a `fixed`/`absolute` overlay inside `.todo-lit` / `.todo-task-card` (their hover `transform` clips and re-stacks it). A form that autosaves on blur must also save on close (Esc/backdrop don't blur) — see `TaskDetailModal`. Render `<Popover>` unconditionally and toggle `open`.
- **Failed saves:** a service method that returns `null`/`false` instead of throwing should call `reportFailure('do the thing', error)` so the user sees a toast; if the caller shows its own inline error instead (like `createInboxItem`, `saveDailyPlan`) it must *not*, or the user hears it twice. Mount `<ToastHost />` on any new page that wants toasts.
- **Clearing a field:** a `PATCH` with `null` empties a *nullable* column (the `*_NULLABLE` sets in each `ai_todo` router and its `fe-apis/todo` twin) and is ignored for required ones — send `''` to empty a text field (works on every server version) and `null` to clear a date. **Any new editable field with an "empty" state belongs in both nullable sets.** **Autosaving forms** should run saves through `useSaveStatus` (`ai-todo/shared/useSaveStatus.tsx`): one status indicator, Retry that replays only the latest payload per field, and `settled()` to await before closing. **Deletes** treat a 404 as success (`isAlreadyGone` in `todoService.ts`) and guard against a double click.
- **Full-height pages:** use `.h-app-screen` instead of `h-screen` (it subtracts the account-status banner; identical when there is none).
- **Smart To-Do visual vocabulary (2026-10-15).** Open rows (`.todo-row`; `.todo-row-card` for the matrix), soft surfaces (`.todo-surface`), quiet controls (`todo-btn-quiet`, `todo-input-quiet`, `todo-segmented-quiet`) are new names on purpose: `.todo-lit`, `.todo-task-card`, `.todo-btn-secondary` and `.todo-segmented` are still used by Daily Session, Swipe Learn and the other To-Do tabs, so don't restyle them in place. Colour roles are tokens in `styles/tailwind.css`: violet = `--color-primary`, green = `--color-success`, coral = `--color-error`, amber = `--color-warning`, blue = `--color-progress`, cyan = `--color-info`; status and priority map onto them in `ai-todo/shared/semanticColors.ts`. Depth: `--color-depth-1…5` ← `DEPTH_COLORS` in `todoService.ts` (L1 blue, L2 violet, L3 cyan, L4 amber, L5+ pink) drives the rail on every row (`.todo-rail`), the dimmer branch beside an expanded parent (`.todo-branch`) and the legend; a row's level comes from the real tree (`buildDepthMap`), never from where it is drawn, so List / Focus / search / filters stay correct. Use `mix-*` utilities for `progress` / `info` (they are not Tailwind colours).
- **Verifying:** run both servers against *copies* of the DBs (`LABNINJA_TEST_DB_PATH`, `CAREER_STUDIO_DB_PATH`, `LMS_CLASSES_DIR` → scratch) and drive the UI with Playwright (guest + logged-in, 1440×900 and 390×844, light + dark). **A new sign-up is "pending admin approval" and every `/todo/*` call returns 403** — in the scratch DB copy run `UPDATE users SET status='approved' WHERE email='…'` before testing logged-in flows.
- The Vercel deployment ran in `nextjs-api` mode on 2026-10-10, where `/todo/*` isn't served for logged-in users; re-check `/api/health` and test locally and as a guest.
- Each phase is done when: `npm run type-check` and `npm run lint` pass, and the listed behavior is re-checked in the browser (type-checking alone has missed real bugs in this repo).

---

## Parked for later (features & design style — *after* this checklist)

**Features**
- Command palette (`Cmd+K`) and keyboard shortcuts (`n` new, `/` search, `j/k` move).
- Bulk select / multi-edit; drag to reorder and indent in the tree.
- Saved views, tags/labels; calendar/timeline view; reminders/notifications.
- A real **Focus** mode with a timer (the "Focus" layout today only filters in-progress/overdue).
- Recurring-task management UI; task templates; import/export beyond Goals CSV.
- Orphaned AI endpoints with no UI: `POST /todo/ai/smart-schedule` ("plan my day by energy") and `suggest-intention` for *existing* tasks.
- Persisted weekly review / retrospective.

**Design style**
- Revisit the `todo-lit` glow: cards, stat tiles, the capture bar, project cards and every goal column all glow at rest, so nothing stands out as *the* important thing — do this first when styling starts, because it drives visual hierarchy.
- Type scale and spacing tokens, accent presets, density themes.
- One icon set (after 1.6), semantic color tokens for priority/status, motion language, empty-state illustrations.

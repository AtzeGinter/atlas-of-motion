# Calendar (v2.0): design

The repeating 7-slot week ("Day 1 .. Day 7") is replaced by a real calendar. This note is the contract for `tools/template.html`; CLAUDE.md carries the short version.

## Concepts

- **Template**: a named, reusable workout (`items` strength entries, `ses` endurance sessions). Editing a template never touches dated sessions that were created from it.
- **Weekly pattern**: rows `{tid, wd:[0..6], from, until?}` (0 = Monday). For every date >= today a pattern row produces a *virtual* session of its template. Nothing is stored for it until the user touches it.
- **Session instance**: one dated workout (`CAL.days["YYYY-MM-DD"]` is a list, so a date can hold several). It owns deep copies of its entries, so editing one instance never changes its template or the pattern. A session is also the training log of that day (Today view): done data lives in the instance.
- **Window**: any 7 consecutive dates (default: the 7 days ending today). Volume, heatmap, recovery, balance, overview and gap filler are computed on the window.

## Storage (old keys are left untouched, for rollback)

| Key | Content |
|---|---|
| `aom.tpl.v1` | `[{id,name,items:[{n,sets,v:[optionNames],o?}],ses:[{a,k,min,n?,len?,rec?,sp?,o?}]}]`. `o` = position in the combined (strength + endurance) list, as in the old days. |
| `aom.cal.v1` | `{v:1, seq, mig:1, note:0|1, pattern:[{id,tid,wd,from,until?}], days:{date:[inst...]}}`. `seq` is the id counter (ids `t<n>`, `p<n>`, `i<n>`). `mig` = migration done. `note` = the one-time migration notice is still to be shown. |
| `aom.win.v1` | window start `"YYYY-MM-DD"`, written only when the user moved the window; absent = "7 days ending today". |
| `aom.plan.v3`, `aom.log.v1` | legacy, read once by the migration, never written again. |

Instance on disk: `{id, tid?, pid?, name, items, ses, status:"planned"|"done"|"skipped", startedAt?, finishedAt?, lg?}`. `lg` = `{ex:[{n,v:[names],o,skip?,sets:[{r?,w?,done}]}], ses:[{a,k,min,o,done,act?,hr?,skip?, n?,len?,rec?,sp?}]}`: exactly the shape of an old `aom.log.v1` entry, so the Today view code is reused unchanged; it appears when the session is started. A removed pattern session is stored as the tombstone `{pid, status:"removed"}` in `days[date]`.

## Virtual sessions

`insts(date)` = stored instances (without tombstones) + one virtual instance per pattern row that applies to the date, **only for dates >= today**, unless a stored instance or a tombstone with the same `pid` exists on that date. Virtual instances are cached objects; the first change (edit, start, skip, move, remove, rename) *materialises* the object into `days[date]`, keeping its `pid`. Removing a session that has a `pid` on a date >= today stores a tombstone, so it does not come back. Moving it leaves a tombstone on the source date. Past dates show only stored instances.

## Migration (once, when `aom.cal.v1` is absent)

1. Old week = `aom.plan.v3` (else `aom.plan.v2`, else the legacy `myology.plan.v1`). Every non-empty day becomes a template named like the day ("Day 3", "Push").
2. One pattern row per such template maps Day 1..7 to Monday..Sunday, `from` = the Monday of the current week. `note` = 1: the Workout tab shows a one-time notice that the mapping can be changed in the pattern editor.
3. Every `aom.log.v1` entry becomes a stored instance on its date, named like the log, `tid` set when a template with that name exists, `status` done when finished or anything was done, else planned; the log goes into `lg`.
4. `aom.cal.v1` is written with `mig:1`. Import of a backup without `aom.cal.v1` drops the calendar keys first, so the migration runs again for an old backup.

## Window semantics

`week[0..6]` stays the structure that all models read, but it is **derived** from the window: `week[k] = {date, name:"Mon 13 Oct", items, ses}` = union over the sessions of that date, by status: skipped = nothing; done = done sets and done minutes only; planned on a date >= today = the planned entries; planned on a past date = done sets only (a past session never started contributes nothing). A done session without log counts as planned. Items are the instance objects themselves where possible (planned), so reads are cheap; all writes go through instance functions, never through `week`.

`dayModel()` also reads the 3 days before the window (`pre`), so carry-over / conflicts of the first days are right. There is no wrap-around any more. The gap filler may only place suggestions on dates >= today inside the window; otherwise the card says "Move the window forward to plan ahead".

## UI map (Workout tab)

1. Calendar header: window bar (-7, -1, date input, +1, +7, "Last 7 days", "Next 7 days"), strip `#wstrip` of 7 date cards (weekday, date, session chips with status, sets/endurance pills, load bar, today marker, conflict mark).
2. Selected date: `#sessList` session cards (name, status, summary, Start/Continue/View, Edit, move-to-date, Skip, Remove), `+ Add session` (template or empty), then the editor of the current session (`#plan`, `#ses`, `#qa`, endurance form, Save changes to template, Save as new template), collapsed until the session card's Edit button (or an empty "+ Add session") expands it; Done or Escape collapses it (v2.1). The "Move to…" selects of its rows and of the board cards list today and the next 13 dates first, then the other dates of the window, then "Pick a date…".
3. Templates `#tplList`: create, rename, duplicate, delete, edit contents (the same editor, bound to the template).
4. Weekly pattern `#patList`: row = template + 7 weekday chips + from + until; preview of the next 14 days.
5. Today view `#td`: opens an instance (any date).
6. History: past done instances.

## What the old `week` code maps to

| Old | New |
|---|---|
| `week[d].name` "Day N", rename | date label; sessions have names (rename on the session card) |
| `week[d].items/ses` (edited in place) | derived read-only view of the window; edits go to instances (`edMut()`, `boardSet()`) |
| `loadWeek/saveWeek` | `loadCal/saveCal` + `loadTpl/saveTpl`, migration |
| `aom.log.v1`, `logs()`, `newLog()` | `inst.lg`, `startInst()` |
| `dayCopy` (copy day to day) | removed (templates and "Add session" replace it); `Clear day` -> `Clear session` |
| week wrap-around in `carryOf` | 3 pre-window days |
| Board column = plan day | board column = window date; a drop moves the entry to a session of that date |

## Editing targets and the schedule board

- The editor works on one object: the *current session* of the selected date (`curInst()`: the one chosen with Edit, else the first open one, else the first) or, while a template is being edited, that template (`edTpl`). Additions (`addToPlan`, the endurance form, the gap filler, the exercise card) go to `targetInst(date)`: the current session if it is open (or a finished one chosen with Edit), else the first open session of the date, else a new empty "Session". A pattern session is stored at the first write (`mat()`).
- The board lists the cards of the *open* sessions (planned, not finished, not skipped) of each date. A card remembers its session; dropping a card on another column moves that exercise / endurance entry to a session of that date (the session of the card it lands before, else the previous card's, else the first open session, else a new "Session"). Finished and skipped sessions appear as one-line buttons that open their log. Moving a *whole* session to another date is done on its session card (Move to + date input).
- A finished session counts its logged sets; to add planned work to it, choose Edit on it, add the exercise and use "Sync with plan" in its log.


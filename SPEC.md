# Club events

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Club events.

## Goals
- A member signs in, sees upcoming events and signs up for one that has free places.
- A member cannot sign up for the same event twice or for a full event.
- A member withdraws from an event before it starts, which immediately frees their place.
- An organizer creates an event with a title, date, time, location, description, and limit on places.
- An organizer edits an event, but cannot set the limit below the number of members already signed up.
- An organizer cancels an event, and it is clearly marked as cancelled for members.
- An organizer sees who has signed up for their event.
- Each event in the list shows its title, date and free places.
- The details of an event shows its title, date, time, location, description, and free places.
- The admin edits or cancels any event, sees who has signed up for it, and removes a member from it.
- The admin sees all users and switches their role between member and organizer.

## Non-goals
- No payments: every event is free.
- No email or push notifications: members check the site.
- No native mobile app: strictly a responsive web UI accessed via mobile browser.
- No calendar export: no ICS files or external calendar sync.
- No comments or ratings: members cannot comment on or rate events.
- No creation of events by members, only by organizers and the admin.
- No cancellation of events by members, only by organizers and the admin.
- No waitlists: when an event is full, registration is strictly refused without queuing or automatic sign-up.
- No admin sign-up: the admin account exists only from the seed data, and no one can be given the admin role through the UI.
- No deleting users: the admin only changes roles, and accounts are never removed through the UI.

## Constraints
- Node with Express, PostgreSQL, plain HTML and JavaScript in the UI.
- Passwords are stored only as a hash, never as readable text.
- An event has one start column, starts_at timestamptz; there are no separate date and time columns. The UI shows date and time taken from it.
- Layers: routes → services → data. SQL is written only in `src/data/`; a transaction that spans several queries passes one `client` through the data functions.
- Migrations are numbered files in `migrations/`, applied with `npm run migrate`. Seed data comes only from `npm run seed`, never from a migration.
- The session holds only the user id; the role is read from `users` on every request.
- Google is called only from `src/services/google.js`, so tests replace it with a stub.
- Tests use `node --test` with supertest, run one file at a time (`--test-concurrency=1`), name the AC id in each title, and delete the rows they create.
- There is exactly one admin, created by `npm run seed`; the app can't make anyone the admin or remove the admin role.

## The model feature
- Model: Gemini 2.5 Flash (vision), called only from `src/services/poster.js` with plain `fetch`; the key is `GEMINI_API_KEY` in `.env`.
- Input: one PNG or JPEG poster image (max 4 MB) uploaded by an organizer or the admin on `/event`, sent to `POST /api/events/poster`; nothing about any member is sent.
- Output: a suggested title, start date and time, and location, filled into the form for the organizer to correct.
- When it fails (fallback): no key, no answer within 10 seconds (timeout), a 429 or other error, or an answer that is not valid JSON all return empty fields and the note "Could not read the poster. Please type the details". Nothing is ever saved without the organizer pressing Save.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: e-mail and password, stored as a bcrypt hash.
- Provider: Sign in with Google, the authorization-code flow, on the server.
- Linking: matched on Google's account id. An address Google has not marked as verified is never linked to an existing account.
- Roles: member, organizer, admin. Every new account is a member. The role is read from `users` on every request, so a change takes effect on the next page load.

## MCP tools

| Tool | What it does | Who may call it |
| --- | --- | --- |
| get_event | Return the title and description of one event by its id. Use it when asked what an event covers. | organizers, members, the admin |
| list_upcoming_events | Return a list with a title, date, time, location and number of free places for the upcoming events, soonest first. Use it when asked for upcoming events. | organizers, members, the admin|
| list_event_registrations | Return the e-mail and sign-up date of every member registered for an event, by event id. Use it when asked who has signed up for an event. | the event's organizer or the admin |

The MCP server is `src/mcp/server.js` (run with `npm run mcp:club`, over stdio). It acts as one user, set by `MCP_USER_EMAIL` in `.env`; it looks that user up and passes their id to the same service functions the HTTP API calls, so the same permission rules apply.

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
Technologies: plain HTML, CSS and JavaScript, works on desktop and phone screens.
Screens:
- `/login`: Log in and sign up the user with e-mail and password or Google account.
- `/events`: Shows the upcoming events, soonest first, each with its title, date and number of free places.
- `/event-details`: Shows a title, date, time, location, description, number of free places and member status(signup or not for the event). Used by members to see details about the event. Details are retrieve by event_id. Member can signup or withdraw on this screen.
- `/event`: Use to create, edit or cancel an event. Used by organizers for their own events and by the admin for any event. Can not be used by members.
- `/event-signups`: Organizers can see a list with signed-up members for their own event and remove a member from it. Used by organizers for their own events and by the admin for any event. Can not be used by members.
- `/admin/users` (admin only): table of users with e-mail, role and created date; a role dropdown and Save button per row; a "Users" link in the events page header, shown only to the admin.

## Architecture
One request traced through the layers: a member clicks **Sign Up** on `/event-details`, which sends `POST /api/events/:id/signup`.

1. `public/event-details.html` sends the request with `fetch`.
2. `src/app.js` runs the session middleware and `requireAuth`, which loads the signed-in user from `users` and passes the request to the events router.
3. `src/routes/events.js` checks that the id is a number, calls `signUpForEvent(userId, eventId)`, and turns the service's error message into a status code (403, 404, 400, 409).
4. `src/services/events.js` holds the rules: only members may sign up; then, inside one transaction, the event must exist, not be cancelled or started, the member must not already be signed up, and there must be a free place.
5. `src/data/db.js` runs `withTransaction` (BEGIN, COMMIT or ROLLBACK on one client).
6. `src/data/events.js` locks the event row (`SELECT … FOR UPDATE`) so two sign-ups for the last place can't both succeed; `src/data/registrations.js` checks, counts and inserts the `registrations` row.
7. PostgreSQL stores the row; the response is 201 "You are signed up", and the page shows it.

**Where the code does not match the layering:** `requireAuth` in `src/app.js` calls `findUserById` from `src/data/users.js` directly, skipping the service layer.


## Acceptance criteria

### Slice 1: sign-in and the upcoming events list
- [AC-1] A visitor who opens `/events` without signing in lands on `/login` instead.
- [AC-2] After signing in with a seeded account, `/events` shows the upcoming events, each with its title, date and number of free places(equal to the limit while no one has signed up), soonest first.
- [AC-3] A visitor whose verified Google address matches no account clicks "Sign in with Google" on `/login`, lands on `/events`, and one new row appears in `users` with that e-mail, the Google id, role `member`.
- [AC-4] A member with a local account signs in with Google for the first time using the same verified address, lands on `/events`, their existing `users` row now has the Google id, and no new row appears in `users`.
- [AC-5] A user whose Google id is already stored signs in with Google and lands on `/events` as the same account, and the number of rows in `users` is unchanged.
- [AC-6] A visitor whose Google address is not verified sees "Your Google address is not verified.", stays on `/login`, and no row is created or changed in `users`.
- [AC-7] Deleting one event row in the database and reloading `/events` removes that event from the screen.
- [AC-8] After a past event row and a later upcoming event row are added to the database, a member reloading `/events` does not see the past event(one whose start time is before now), and upcoming events are listed soonest first.
- [AC-9] A visitor who signs in with a wrong password sees "Wrong e-mail or password", stays on /login, and no session is created.
- [AC-10] A visitor who signs up with a new e-mail and password lands on `/events`, one new row appears in users with role member, and its password_hash is not the password as typed.

### Slice 2: signing up for an event
- [AC-11] A member who signs up for an upcoming event with free places sees "You are signed up", and exactly one new row with their user id and the event id appears in `registrations`.
- [AC-12] A member who signs up for an event with no free places sees "This event is full", and no new row appears in `registrations`.
- [AC-13] A member who signs up for an event they have already joined sees "You are already signed up", and the number of rows in `registrations` for that member and event stays at 1.
- [AC-14] When two members submit sign-ups at the same time for an event with one free place, one sees "You are signed up" and the other sees "This event is full", and exactly one new row appears in `registrations`.
- [AC-15] A member who tries to sign up for an event that has already started sees "This event has already started", and no new row appears in `registrations`.
- [AC-16] An organizer or the admin who tries to sign up for an event sees "You do not have permission", and no new row appears in `registrations`.

### Slice 3: event details and withdrawing
- [AC-17] A member who opens `/event-details` sees a title, date, time, location, description, number of free places and member status(signup or not for the event).
- [AC-18] A member who withdraws from an upcoming event sees "You have withdrawn", their row is removed from `registrations`, and the event's free places increase by 1.
- [AC-19] A member who tries to withdraw from an event that has already started sees "This event has already started", and their row stays in `registrations`.
- [AC-20] After a member withdraws from a full event, number of free places is increased by 1 and another member who signs up sees "You are signed up", and one new row with that member's user id and the event id appears in `registrations`.

### Slice 4: creating events
- [AC-21] An organizer who submits a valid new event with a limit of 10 places sees it in the events list, and one new row with `capacity` = 10 appears in `events`.
- [AC-22] An organizer who submits a new event with a limit of 0 or less sees "Limit must be at least 1", and no new row appears in `events`.
- [AC-23] An organizer who submits a new event with an empty title or a start time in the past sees a message naming the invalid field, and no new row appears in `events`.
- [AC-24] A member who tries to create an event, open an event's sign-up list, or remove another member sees "You do not have permission", and no rows change in `events` or `registrations`.
- [AC-25] The admin who submits a valid new event sees it in the events list, and one new row appears in `events` with the admin's id as `organizer_id`.

### Slice 5: editing and cancelling events
- [AC-26] An organizer who edits an event's title and location sees the new values on the event page, the same `events` row is updated, and its `registrations` rows are unchanged.
- [AC-27] An organizer who lowers an event's limit below the number of members signed up sees "Limit cannot be lower than the number of sign-ups", and the event's `capacity` stays unchanged.
- [AC-28] An organizer who cancels an event sees it marked "Cancelled", the event's `status` is `cancelled`, and its `registrations` rows are kept.
- [AC-29] A member who tries to sign up for a cancelled event sees "This event has been cancelled", and no new row appears in `registrations`.
- [AC-30] An organizer (not the admin) who tries to edit or cancel an event that is not their own sees "You do not have permission", and no rows change in `events` or `registrations`.

### Slice 6: seeing sign-ups
- [AC-31] An organizer who opens the sign-up list for their event sees exactly the members with a `registrations` row for that event, and no rows change in `events` or `registrations`.
- [AC-32] An organizer who removes a member from the sign-ups list of their upcoming event no longer sees that member in the list, the row with that member id and event id is deleted from `registrations`, and the event's free places increase by 1.
- [AC-33] An organizer (not the admin) who tries to see the sign-up list or remove a member from an event that is not their own sees "You do not have permission", and no rows change in `events` or `registrations`.

### Slice 7: the admin manages user roles
- [AC-34] The admin who opens `/admin/users` sees every user with e-mail, role and created date, and no rows change in `users`.
- [AC-35] The admin who changes a member's role to organizer sees "Role updated", that user's row in `users` now has role `organizer`, and no other row changes.
- [AC-36] A user whose role was changed gets the new permissions on their next request without signing in again: a member promoted to organizer can create an event, and an organizer demoted to member sees "You do not have permission" when creating one.
- [AC-37] The admin who submits a role other than member or organizer (including admin) sees "Role must be member or organizer", and no row changes in `users`.
- [AC-38] The admin who tries to change their own role sees "You cannot change your own role", and their row in `users` still has role `admin`.
- [AC-39] The admin who changes the role of a user id that does not exist sees "User not found", and no row changes in `users`.
- [AC-40] A member or organizer who opens `/admin/users` or tries to change a role sees "You do not have permission", and no row changes in `users`.
- [AC-41] An organizer demoted to member keeps their events in `events` with the same `organizer_id` and all their `registrations` rows, but sees "You do not have permission" when trying to edit or cancel them.
- [AC-42] A member with sign-ups who is promoted to organizer keeps their rows in `registrations`.
- [AC-43] The "Users" link on `/events` is shown only to the admin, and a visitor who is not signed in and opens `/admin/users` lands on `/login`.

### Slice 8: MCP tools
- [AC-44] Calling `get_event` with the id of an existing event returns its title and description, and no rows change.
- [AC-45] Calling `get_event` with an id that does not exist returns "Event not found".
- [AC-46] Calling `list_upcoming_events` returns the same events, in the same order and with the same free places, as `/events`.
- [AC-47] Calling `list_event_registrations` as the event's organizer or the admin returns the e-mail and sign-up date of every member with a `registrations` row for that event, and no password hash.
- [AC-48] Calling `list_event_registrations` as a member or as an organizer who does not own the event returns "You do not have permission", and no rows change.

### Slice 9: reading an event poster
- [AC-49] An organizer or the admin who uploads a poster on `/event` sees the title, start time and location the model suggested filled into the form, and no new row appears in `events`.
- [AC-50] When `GEMINI_API_KEY` is missing, an organizer who uploads a poster sees "Could not read the poster. Please type the details", the fields stay empty, and the model is not called.
- [AC-51] When the model does not answer within 10 seconds, the organizer sees "Could not read the poster. Please type the details", and no new row appears in `events`.
- [AC-52] When the model answers with a 429 or another error, the organizer sees "Could not read the poster. Please type the details", and no new row appears in `events`.
- [AC-53] When the model answers with something that is not valid JSON, the organizer sees "Could not read the poster. Please type the details", and no new row appears in `events`.
- [AC-54] A member who tries to upload a poster sees "You do not have permission", and the model is not called.
- [AC-55] An organizer who uploads a file that is not a PNG or JPEG, or is larger than 4 MB, sees "Upload a PNG or JPEG image under 4 MB", and the model is not called.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
### Slice 1
**Passed:** All criteria from Slice 1 have passed `npm test`: 10 passed.
**What the agent missed, and what I did about it:**
First few plans were incorrect and I've editted and committed changes into the spec. After the changes the plan was way more clearer and correct but still there were few "or"-s and incorrect choices during the slice creation for which I had to decide and instruct the agent manually. For example the agent decided to create the tables with missing columns, it stored the role in the session, added `"type": "module"` broke the Exercise 1 MCP server. Fixed with `mcp-server/package.json`. I set up PostgreSQL inside the Codespace.

### Slice 2
**Passed:** All criteria from Slice 2 have passed `npm test`: 16 passed
**What the agent missed, and what I did about it:**
The plan checked "full" before "already signed up", which breaks AC-13; I had the order changed. It put `BEGIN`/`COMMIT` in the service; moved to `withTransaction` in the data layer. Free places came back as text until `::int` was added. The test file got chat text written into it, which I removed by hand.

### Slice 3
**Passed:** All criteria from Slice 3 have passed `npm test`: 20 passed (AC-1 to AC-20).
**What the agent missed, and what I did about it:**
The spec did not say what happens when a member withdraws without being signed up; I chose 409 "You are not signed up". The plan put the tests in a separate last step; I had them moved into the same step as the code. The AC-20 test did not check that free places go up by 1, and the details page showed the status only through the button, not as text; I had both added.

### Slice 4
**Passed:** All criteria from Slice 4 have passed `npm test`: 25 passed (AC-1 to AC-25).
**What the agent missed, and what I did about it:**
The spec did not say whether admins may create events; I decided yes and added AC-25. The first plan wanted a second `createEvent` that would break older tests, missed checks for a non-numeric limit and empty location or description, and added stub endpoints for Slice 6; I had all three fixed. The sign-up list and removal parts of AC-24 are left for Slice 6.

### Slice 5
**Passed:** All criteria from Slice 5 have passed `npm test`: 31 passed
**What the agent missed, and what I did about it:**
The spec did not say what happens when someone edits or cancels an event that has started or is already cancelled; I chose 400 and 409. The page could not know who may edit, so I had `can_manage` added on the server. The plan again put the routes after the tests. The edit form filled in the date in UTC, which would move events after midnight back a day; I had it fixed. Gemini also tried to edit SPEC.md by itself, which I refused.

### Slice 6
**Passed:** All criteria from Slice 6 have passed `npm test`
**What the agent missed, and what I did about it:**
The test file was missing `after(() => { pool.end(); })`, so `npm test` would hang; I rejected the file and had Gemini add it.

### Slice 7
**Passed:** All criteria from Slice 7 have passed `npm test`: 48 passed.
**What the agent missed, and what I did about it:**
The plan followed the spec closely this time. Its tests would have compared the user list to a fixed number and not checked that other users stay unchanged; I had AC-34 compare against the real row count and AC-35 check a second user. The "Users" link on `/events` is client-side, so it is checked by hand, not by `npm test`.

### Slice 8
**Passed:** All criteria from Slice 8 have passed `npm test`: 53 passed.
**What the agent missed, and what I did about it:**
The spec did not say how the MCP server knows who is calling; I added `MCP_USER_EMAIL` to the spec. The plan missed that dotenv prints a line to stdout, which would break the MCP protocol; I had it silenced with `DOTENV_CONFIG_QUIET=true` in the `mcp:club` script. The first plan's tests only checked formatting; I had AC-46 compare with `getUpcomingEvents()`, AC-47 test both the organizer and the admin, and AC-48 test both a member and another organizer.
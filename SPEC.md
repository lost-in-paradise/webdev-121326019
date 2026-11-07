# Club events

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Club events.

## Goals
-A member signs in, sees upcoming events and signs up for one that has free places.
-A member cannot sign up for the same event twice or for a full event.
-A member withdraws from an event before it starts, which immediately frees their place.
-An organizer creates an event with a title, date, time, location, description, and limit on places.
-An organizer edits an event, but cannot set the limit below the number of members already signed up.
-An organizer cancels an event, and it is clearly marked as cancelled for members.
-An organizer sees who has signed up for their event.
-Each event in the list shows its title, date and free places.
-The details of an event shows its title, date, time, location, description, and free places.

## Non-goals
-No payments: every event is free.
-No email or push notifications: members check the site.
-No native mobile app: strictly a responsive web UI accessed via mobile browser.
-No calendar export: no ICS files or external calendar sync.
-No comments or ratings: members cannot comment on or rate events.
-No creation of events by members, only by organizers.
-No cancellation of events by members, only by organizers.
-No waitlists: when an event is full, registration is strictly refused without queuing or automatic sign-up.

## Constraints
-Node with Express, PostgreSQL, plain HTML and JavaScript in the UI.
-Passwords are stored only as a hash, never as readable text.

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
-Model: Gemini 2.5 Flash, vision, called from `services/poster.js` and nowhere else.
-Input: the poster image an organizer uploads, and nothing about any member.
-Output: a suggested title, date and place, shown in the form for the organizer to correct.
-When it fails: no key, a timeout or a 429 all leave the form empty with a note saying to
  type it in - "Could not read the poster. Please type the details". Nothing is ever saved without the organizer pressing save.


## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
-Local: e-mail and password, stored as a bcrypt hash.
-Provider: Sign in with Google, the authorization-code flow, on the server.
-Linking: matched on Google's account id. On a first Google sign-in with a verified address that matches an existing account, add google id to the user. If the address is not verified, the Google sign-in is refused, no account is linked or created, and the user sees "Your Google address is not verified.". If the address is verified and no account matches, a new member account is created with the Google id.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| get_event | Return the title and description of one event by its id. Use it when asked what an event covers. | organizers, members |
| list_upcoming_events | Return a list with a title, date, time, location and number of free places for the upcoming events, soonest first. Use it when asked for upcoming events. | organizers, members|
| list_event_registrations | Return a list with the member email and name for all members registered for the organizer's own event, by event id. Use it when asked who has signed up for an event. | the event's organizer |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
Technologies: plain HTML, CSS and JavaScript, works on desktop and phone screens.
Screens:
-`/login`: Log in and sign up the user with e-mail and password or Google account.
-`/events`: Shows the upcoming events, soonest first, each with its title, date and number of free places.
-`/event-details`: Shows a title, date, time, location, description, number of free places and member status(signup or not for the event). Used by members to see details about the event. Details are retrieve by event_id. Member can signup or withdraw on this screen.
-`/event`: Use to create, edit or cancel an event. Can be used only by organizers. Can not be used by members.
-`/event-signups`: Organizers can see a list with signed-up members for their own event and remove a member from it. Can be used only by organizers. Can not be used by members.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->

### Slice 1: sign-in and the upcoming events list
-[AC-1] A visitor who opens `/events` without signing in lands on `/login` instead.
-[AC-2] After signing in with a seeded account, `/events` shows the upcoming events, each with its title, date and number of free places, soonest first.
-[AC-3] Deleting one event row in the database and reloading `/events` removes that event from the screen.
-[AC-4] After a past event row and a later upcoming event row are added to the database, a member reloading `/events` does not see the past event, and upcoming events are listed soonest first.

### Slice 2: signing up for an event
-[AC-5] A member who signs up for an upcoming event with free places sees "You are signed up", and exactly one new row with their user id and the event id appears in `registrations`.
-[AC-6] A member who signs up for an event with no free places sees "This event is full", and no new row appears in `registrations`.
-[AC-7] A member who signs up for an event they have already joined sees "You are already signed up", and the number of rows in `registrations` for that member and event stays at 1.
-[AC-8] When two members submit sign-ups at the same time for an event with one free place, one sees "You are signed up" and the other sees "This event is full", and exactly one new row appears in `registrations`.
-[AC-9] A member who tries to sign up for an event that has already started sees "This event has already started", and no new row appears in `registrations`.

### Slice 3: event details and withdrawing
-[AC-10] A member who opens `/event-details` sees a title, date, time, location, description, number of free places and member status(signup or not for the event).
-[AC-11] A member who withdraws from an upcoming event sees "You have withdrawn", their row is removed from `registrations`, and the event's free places increase by 1.
-[AC-12] A member who tries to withdraw from an event that has already started sees "This event has already started", and their row stays in `registrations`.
-[AC-13] After a member withdraws from a full event, number of free places is increased by 1 and another member who signs up sees "You are signed up", and one new row with that member's user id and the event id appears in `registrations`.

### Slice 4: creating events
-[AC-14] An organizer who submits a valid new event with a limit of 10 places sees it in the events list, and one new row with `capacity` = 10 appears in `events`.
-[AC-15] An organizer who submits a new event with a limit of 0 or less sees "Limit must be at least 1", and no new row appears in `events`.
-[AC-16] An organizer who submits a new event with an empty title or a start time in the past sees a message naming the invalid field, and no new row appears in `events`.
-[AC-17] A member who tries to create an event, open an event's sign-up list, or remove another member sees "You do not have permission", and no rows change in `events` or `registrations`.

### Slice 5: editing and cancelling events
-[AC-18] An organizer who edits an event's title and location sees the new values on the event page, the same `events` row is updated, and its `registrations` rows are unchanged.
-[AC-19] An organizer who lowers an event's limit below the number of members signed up sees "Limit cannot be lower than the number of sign-ups", and the event's `capacity` stays unchanged.
-[AC-20] An organizer who cancels an event sees it marked "Cancelled", the event's `status` is `cancelled`, and its `registrations` rows are kept.
-[AC-21] A member who tries to sign up for a cancelled event sees "This event has been cancelled", and no new row appears in `registrations`.
-[AC-22] An organizer who tries to edit or cancel an event that is not their own sees "You do not have permission", and no rows change in `events` or `registrations`.

### Slice 6: seeing sign-ups
-[AC-23] An organizer who opens the sign-up list for their event sees exactly the members with a `registrations` row for that event, and no rows change in `events` or `registrations`.
-[AC-24] An organizer who removes a member from the sign-ups list of their upcoming event no longer sees that member in the list, the row with that member id and event id is deleted from `registrations`, and the event's free places increase by 1.
-[AC-25] An organizer who tries to see the sign-up list or remove a member from an event that is not their own sees "You do not have permission", and no rows change in `events` or `registrations`.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->

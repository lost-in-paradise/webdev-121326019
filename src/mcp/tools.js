import { getEventDetails, getUpcomingEvents, getEventSignups } from '../services/events.js';

function toolResult(text, isError = false, extra = {}) {
  return {
    content: [{ type: 'text', text }],
    isError,
    text,
    ...extra
  };
}

function handleServiceError(err) {
  const message = err?.message;
  if (message === 'Event not found' || message === 'You do not have permission' || message === 'Invalid event id') {
    return toolResult(message, true);
  }
  return toolResult('Internal server error', true);
}

export async function get_event(userId, args) {
  try {
    const rawId = args?.event_id !== undefined ? args.event_id : args?.id;
    const eventId = Number(rawId);
    if (rawId === undefined || rawId === null || isNaN(eventId) || !Number.isInteger(eventId)) {
      return toolResult('Invalid event id', true);
    }
    const details = await getEventDetails(userId, eventId);
    const text = `Title: ${details.title}\nDescription: ${details.description}`;
    return toolResult(text, false, {
      title: details.title,
      description: details.description
    });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function list_upcoming_events(userId, args) {
  try {
    const events = await getUpcomingEvents();
    const formattedList = events.map(e => {
      const d = new Date(e.starts_at);
      const date = d.toISOString().split('T')[0];
      const time = d.toISOString().split('T')[1].slice(0, 5);
      return `Title: ${e.title}, Date: ${date}, Time: ${time}, Location: ${e.location}, Free places: ${e.free_places}`;
    });
    const text = formattedList.length > 0 ? formattedList.join('\n') : 'No upcoming events.';
    return toolResult(text, false, { events });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function list_event_registrations(userId, args) {
  try {
    const rawId = args?.event_id !== undefined ? args.event_id : args?.id;
    const eventId = Number(rawId);
    if (rawId === undefined || rawId === null || isNaN(eventId) || !Number.isInteger(eventId)) {
      return toolResult('Invalid event id', true);
    }
    const signups = await getEventSignups(userId, eventId);
    const formattedList = signups.map(s => {
      const dateStr = s.registered_at ? new Date(s.registered_at).toISOString() : '';
      return `Email: ${s.email}, Sign-up date: ${dateStr}`;
    });
    const text = formattedList.length > 0 ? formattedList.join('\n') : 'No registrations.';
    return toolResult(text, false, { registrations: signups });
  } catch (err) {
    return handleServiceError(err);
  }
}

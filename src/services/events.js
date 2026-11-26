import { findUpcomingEvents } from '../data/events.js';

export async function getUpcomingEvents() {
  const events = await findUpcomingEvents();
  return events.map(event => ({
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    location: event.location,
    description: event.description,
    capacity: event.capacity,
    free_places: event.capacity,
    status: event.status
  }));
}

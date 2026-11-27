import { findUpcomingEvents, findEventById, findEventByIdWithClient, findEventDetailsById, createEvent, updateEventWithClient, cancelEventWithClient } from '../data/events.js';
import { findUserById } from '../data/users.js';
import { findRegistrationWithClient, countRegistrationsWithClient, createRegistrationWithClient, deleteRegistrationWithClient, findRegistrationsByEventId } from '../data/registrations.js';
import { withTransaction } from '../data/db.js';

export async function getUpcomingEvents() {
  const events = await findUpcomingEvents();
  return events.map(event => ({
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    location: event.location,
    description: event.description,
    capacity: event.capacity,
    free_places: event.free_places,
    status: event.status
  }));
}

export async function getEventDetails(userId, eventId) {
  const event = await findEventDetailsById(userId, eventId);
  if (!event) {
    throw new Error('Event not found');
  }
  const user = await findUserById(userId);
  const can_manage = !!user && (user.role === 'admin' || event.organizer_id === user.id);

  return {
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    location: event.location,
    description: event.description,
    capacity: event.capacity,
    free_places: event.free_places,
    status: event.status,
    is_registered: event.is_registered,
    can_manage
  };
}

export async function signUpForEvent(userId, eventId) {
  // 1. Role check (403)
  const user = await findUserById(userId);
  if (!user || user.role === 'organizer' || user.role === 'admin') {
    throw new Error('You do not have permission');
  }

  return await withTransaction(async (client) => {
    // 2. Existence check (404)
    const event = await findEventByIdWithClient(client, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // 2.5 Cancelled check (409)
    if (event.status === 'cancelled') {
      throw new Error('This event has been cancelled');
    }

    // 3. Already started check (400)
    if (new Date(event.starts_at) <= new Date()) {
      throw new Error('This event has already started');
    }

    // 4. Already signed up check (409)
    const existingRegistration = await findRegistrationWithClient(client, userId, eventId);
    if (existingRegistration) {
      throw new Error('You are already signed up');
    }

    // 5. Full check (409)
    const regCount = await countRegistrationsWithClient(client, eventId);
    if (regCount >= event.capacity) {
      throw new Error('This event is full');
    }

    // 6. Insert registration with unique constraint handling (23505 -> 409)
    try {
      const registration = await createRegistrationWithClient(client, userId, eventId);
      return registration;
    } catch (err) {
      if (err.code === '23505') {
        throw new Error('You are already signed up');
      }
      throw err;
    }
  });
}

export async function withdrawFromEvent(userId, eventId) {
  const user = await findUserById(userId);
  if (!user || user.role === 'organizer' || user.role === 'admin') {
    throw new Error('You do not have permission');
  }

  return await withTransaction(async (client) => {
    const event = await findEventByIdWithClient(client, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    if (new Date(event.starts_at) <= new Date()) {
      throw new Error('This event has already started');
    }

    const existingRegistration = await findRegistrationWithClient(client, userId, eventId);
    if (!existingRegistration) {
      throw new Error('You are not signed up');
    }

    await deleteRegistrationWithClient(client, userId, eventId);
    return { success: true, message: 'You have withdrawn' };
  });
}

export async function createEventService(userId, { title, startsAt, location, description, capacity }) {
  const user = await findUserById(userId);
  if (!user || user.role === 'member') {
    throw new Error('You do not have permission');
  }

  const capNum = Number(capacity);
  if (!Number.isInteger(capNum) || capNum < 1) {
    throw new Error('Limit must be at least 1');
  }

  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Title must not be empty');
  }

  if (!location || typeof location !== 'string' || location.trim() === '') {
    throw new Error('Location must not be empty');
  }

  if (!description || typeof description !== 'string' || description.trim() === '') {
    throw new Error('Description must not be empty');
  }

  const startDate = new Date(startsAt);
  if (isNaN(startDate.getTime()) || startDate <= new Date()) {
    throw new Error('Start time must be in the future');
  }

  const event = await createEvent({
    title: title.trim(),
    startsAt: startDate.toISOString(),
    location: location.trim(),
    description: description.trim(),
    capacity: capNum,
    status: 'active',
    organizerId: user.id
  });

  return event;
}

export async function updateEventService(userId, eventId, { title, startsAt, location, description, capacity }) {
  const user = await findUserById(userId);
  if (!user || user.role === 'member') {
    throw new Error('You do not have permission');
  }

  return await withTransaction(async (client) => {
    const event = await findEventByIdWithClient(client, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const isOwner = event.organizer_id === user.id;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission');
    }

    if (event.status === 'cancelled') {
      throw new Error('This event has been cancelled');
    }

    if (new Date(event.starts_at) <= new Date()) {
      throw new Error('This event has already started');
    }

    const capNum = Number(capacity);
    if (!Number.isInteger(capNum) || capNum < 1) {
      throw new Error('Limit must be at least 1');
    }

    if (!title || typeof title !== 'string' || title.trim() === '') {
      throw new Error('Title must not be empty');
    }

    if (!location || typeof location !== 'string' || location.trim() === '') {
      throw new Error('Location must not be empty');
    }

    if (!description || typeof description !== 'string' || description.trim() === '') {
      throw new Error('Description must not be empty');
    }

    const startDate = new Date(startsAt);
    if (isNaN(startDate.getTime()) || startDate <= new Date()) {
      throw new Error('Start time must be in the future');
    }

    const regCount = await countRegistrationsWithClient(client, eventId);
    if (capNum < regCount) {
      throw new Error('Limit cannot be lower than the number of sign-ups');
    }

    const updatedEvent = await updateEventWithClient(client, eventId, {
      title: title.trim(),
      startsAt: startDate.toISOString(),
      location: location.trim(),
      description: description.trim(),
      capacity: capNum
    });

    return updatedEvent;
  });
}

export async function cancelEventService(userId, eventId) {
  const user = await findUserById(userId);
  if (!user || user.role === 'member') {
    throw new Error('You do not have permission');
  }

  return await withTransaction(async (client) => {
    const event = await findEventByIdWithClient(client, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const isOwner = event.organizer_id === user.id;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission');
    }

    if (event.status === 'cancelled') {
      throw new Error('This event has been cancelled');
    }

    if (new Date(event.starts_at) <= new Date()) {
      throw new Error('This event has already started');
    }

    const cancelledEvent = await cancelEventWithClient(client, eventId);
    return cancelledEvent;
  });
}

export async function getEventSignups(userId, eventId) {
  const user = await findUserById(userId);
  if (!user || user.role === 'member') {
    throw new Error('You do not have permission');
  }

  const event = await findEventById(eventId);
  if (!event) {
    throw new Error('Event not found');
  }

  const isOwner = event.organizer_id === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new Error('You do not have permission');
  }

  const signups = await findRegistrationsByEventId(eventId);
  return signups;
}

export async function removeMemberFromEvent(userId, eventId, memberId) {
  const user = await findUserById(userId);
  if (!user || user.role === 'member') {
    throw new Error('You do not have permission');
  }

  return await withTransaction(async (client) => {
    const event = await findEventByIdWithClient(client, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const isOwner = event.organizer_id === user.id;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission');
    }

    if (event.status === 'cancelled') {
      throw new Error('This event has been cancelled');
    }

    if (new Date(event.starts_at) <= new Date()) {
      throw new Error('This event has already started');
    }

    const existingRegistration = await findRegistrationWithClient(client, memberId, eventId);
    if (!existingRegistration) {
      throw new Error('Member is not signed up');
    }

    await deleteRegistrationWithClient(client, memberId, eventId);
    return { success: true, message: 'Member removed' };
  });
}


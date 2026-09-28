# Domain Context: Daleel Backend

This document defines the core domain concepts, entities, and business rules for Daleel.

---

## 1. Core Domain Concepts

### Users & Roles

- **Unified Identity**: Every person registered on Daleel is represented by a single `User` entity. There is no separate "Mentee" account or table.
- **Mentee by Default**: Every authenticated `User` possesses mentee capabilities upon registration (discovering mentors, booking sessions, saving interests).
- **Mentor Capability**: Mentorship is modeled as an attached capability rather than a separate role. A user becomes a mentor by creating a `MentorProfile` (1-to-0..1 relationship).
- **Mentor Status (`isActive`)**: Mentors can temporarily toggle their active status on or off to pause incoming requests without deleting their profile data.

---

## 2. Entities & Terminology

### `User`

The primary identity record across Daleel:

- **`id`**: Unique UUID.
- **`email`**: Unique, lowercased email address.
- **`passwordHash`**: Securely hashed credentials (managed by the Auth module).
- **`name`**: Full display name.
- **`bio`**: Brief personal summary (1–2 sentences) representing the person in comments and bookings.
- **`avatarUrl`**: Link to uploaded profile picture.
- **`interests`**: List of topic strings the user is interested in learning about (feeds mentor matching & AI recommendations).

### `MentorProfile`

Mentoring-specific details attached to a `User`:

- **`headline`**: Short professional title/tagline (e.g., "Staff Engineer @ Acme").
- **`about`**: Detailed mentoring manifesto explaining their pedagogical approach, expertise, and what mentees can expect.
- **`skills`**: List of skill tags the mentor can teach (used for matching against mentee `interests`).
- **`yearsOfExperience`**: Professional experience indicator.
- **`linkedinUrl`**: External credibility verification.
- **`isActive`**: Visibility toggle for public discovery.

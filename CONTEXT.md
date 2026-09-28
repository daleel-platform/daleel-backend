# Domain Context

Domain terminology and core concepts for the Daleel backend.

## Users & Mentorship Model

- **User**: The single identity entity for all platform accounts. Everyone is a mentee by default.
- **MentorProfile**: Attached 1-to-0..1 profile that grants mentor capability. Activated on creation, togglable via `isActive`.
- **Bio vs. About**:
  - `User.bio`: Brief personal summary (1–2 sentences) shown on community cards and session bookings.
  - `MentorProfile.about`: In-depth mentorship pitch detailing approach and offerings.
- **Interests & Skills**:
  - `User.interests`: Topics a mentee wants to learn (source data for mentor recommendations).
  - `MentorProfile.skills`: Topics a mentor can teach.

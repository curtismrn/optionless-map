// Planned entities — typed now so the data layer and DB schema can grow into
// them without reshaping the core model. Nothing in the prototype creates these.

export type EntityRef = { type: "location" | "variant" | "poi"; id: string };

// MediaItem is now a core entity — see schema.ts.

export interface VehicleProfile {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year?: number;
  drivetrain?: "FWD" | "RWD" | "AWD";
  notes?: string;
}

/**
 * Timed sessions are scoped to authorized venues: circuits, closed courses and
 * sanctioned events. Public-road timing is out of scope by design.
 */
export interface TimedSession {
  id: string;
  variantId: string;
  venueAuthorization: { kind: "circuit" | "closed_course" | "sanctioned_event"; reference: string };
  eventName?: string;
  date: string;
  vehicleId?: string;
  driverId?: string;
}

export interface TimingRecord {
  id: string;
  sessionId: string;
  elapsedMs: number;
  method: "transponder" | "official_timing" | "gps_logger" | "video_derived" | "self_reported";
  measurementSource: string;
  evidence: EntityRef[];
  /** User-entered times always start unverified. */
  verification: "unverified" | "under_review" | "verified" | "rejected";
  verificationRecordId?: string;
}

export interface VerificationRecord {
  id: string;
  subject: EntityRef | { type: "timing"; id: string };
  reviewerId: string;
  decision: "verified" | "rejected";
  reasoning: string;
  decidedAt: string;
}

export interface ModerationReport {
  id: string;
  subject: EntityRef | { type: "media" | "contribution"; id: string };
  reason: "inaccurate" | "unsafe" | "private_location" | "spam" | "copyright" | "illegal_activity" | "other";
  details?: string;
  status: "open" | "actioned" | "dismissed";
  createdAt: string;
}

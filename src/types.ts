export type Format = "Single Elim" | "Double Elim" | "Round Robin";

export type Tournament = {
  id: string;
  code: string;             // join code (AB12)
  name: string;
  venue: string;
  format: Format;
  startsAt?: string;
  players: string[];
  createdAt: string;
  hostName?: string;
  hostDeviceId?: string;
};

export type Membership = {
  tournamentId: string;
  playerName: string;
  joinedAt: string;
};

export type Queue = {
  id: string;
  name: string;
  distance?: string;
};

export type QueueMembership = {
  queueId: string;
  joinedAt: string;
};

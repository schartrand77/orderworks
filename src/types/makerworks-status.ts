export type MakerWorksStatus = "connected" | "waiting" | "stale" | "error";

export interface MakerWorksStatusPayload {
  connected: boolean;
  status: MakerWorksStatus;
  lastJobReceivedAt: string | null;
  thresholdMinutes: number;
  error?: string;
}

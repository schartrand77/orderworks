export type MakerWorksStatus = "connected" | "waiting" | "stale" | "error";

export interface MakerWorksStatusPayload {
  connected: boolean;
  status: MakerWorksStatus;
  lastJobReceivedAt: string | null;
  thresholdMinutes: number;
  error?: string;
}

export interface MakerWorksHealthPayload extends MakerWorksStatusPayload {
  events: {
    total: number;
    received: number;
    processed: number;
    failed: number;
    lastEventAt: string | null;
  };
  jobs: {
    total: number;
  };
  appUptimeSeconds: number;
}

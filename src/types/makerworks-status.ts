export type MakerWorksStatus = "connected" | "waiting" | "stale" | "error";

export interface MakerWorksStatusPayload {
  connected: boolean;
  status: MakerWorksStatus;
  lastJobReceivedAt: string | null;
  thresholdMinutes: number;
  error?: string;
}

export interface MakerWorksHealthPayload extends MakerWorksStatusPayload {
  jobs: {
    orderworksTotal: number;
    makerworksTotal: number;
    lastMakerWorksUpdate: string | null;
    lastSyncAt: string | null;
    lastSyncDurationMs?: number | null;
    lastSyncProcessed?: number;
  };
  appUptimeSeconds: number;
}

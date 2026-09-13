export const runtimeState = {
  startedAt: Date.now(),
  jetstreamConnected: false,
  jetstreamLastEventAt: null as number | null,
  jetstreamLastError: null as string | null,
  lastQueueRunAt: null as number | null,
  lastDeliveryAt: null as number | null,
  lastDeliveryError: null as string | null,
};

import type { RtEvent } from "./types";

export type WorkStageEventSink = (event: Omit<RtEvent, "at">) => void;

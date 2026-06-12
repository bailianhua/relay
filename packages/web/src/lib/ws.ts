type Listener = (event: RelayEvent) => void;

export interface RelayEvent {
  type: "relay_started" | "relay_stopped" | "target_added" | "target_removed";
  guildId: string;
  [key: string]: unknown;
}

class RelaySocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private subscribedGuild: string | null = null;

  connect() {
    if (this.ws) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${protocol}://${location.host}/ws`);

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as RelayEvent;
        for (const fn of this.listeners) fn(event);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      setTimeout(() => this.connect(), 3000);
    };

    this.ws.onopen = () => {
      if (this.subscribedGuild) this.subscribe(this.subscribedGuild);
    };
  }

  subscribe(guildId: string) {
    this.subscribedGuild = guildId;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", guildId }));
    }
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

export const relaySocket = new RelaySocket();

import { resolveApiBaseUrl, resolveWsBaseUrl } from '../config/backend';

export type WsRelayStatus = 'SUBSCRIBED' | 'CLOSED' | 'ERROR';

export interface WsRelayMember {
  memberId: string;
  username?: string;
}

export interface WsRelayOptions {
  memberId: string;
  username?: string;
}

type EventHandler = (payload: any, meta?: { fromMemberId?: string }) => void;

export function getGameWsUrl(): string {
  const wsBase = resolveWsBaseUrl();
  if (wsBase) return `${wsBase}/ws`;
  if (typeof window !== 'undefined' && !window.location?.hostname?.endsWith('.github.io')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return '';
}

export class WsRoomChannel {
  private channelName: string;
  private memberId: string;
  private username: string;
  private ws: WebSocket | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private statusCallback: ((status: WsRelayStatus, meta?: { members?: WsRelayMember[] }) => void) | null = null;
  private pendingQueue: Array<{ event: string; payload: any; includeSelf?: boolean }> = [];
  private isJoined = false;
  private isClosed = false;
  private usingHttpFallback = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private httpPollTimer: ReturnType<typeof setInterval> | null = null;
  private httpPollInFlight = false;
  private httpAfterId = 0;

  constructor(channelName: string, options: WsRelayOptions) {
    this.channelName = channelName;
    this.memberId = options.memberId;
    this.username = options.username || 'Player';
  }

  on(event: string, handler: EventHandler): this {
    const list = this.handlers.get(event) || [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  private emitLocal(event: string, payload: any, meta?: { fromMemberId?: string }) {
    const list = this.handlers.get(event);
    if (!list) return;
    list.forEach((fn) => {
      try {
        fn(payload, meta);
      } catch (e) {
        console.error('WsRoomChannel handler error:', e);
      }
    });
  }

  private getHttpRelayBase(): string {
    return resolveApiBaseUrl();
  }

  private async startHttpFallback() {
    if (this.isClosed || this.usingHttpFallback) return;
    const base = this.getHttpRelayBase();
    if (!base) {
      this.statusCallback?.('ERROR');
      return;
    }
    this.usingHttpFallback = true;
    try {
      const resp = await fetch(`${base}/api/relay/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: this.channelName,
          memberId: this.memberId,
          username: this.username,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (this.isClosed) return;
      this.httpAfterId = Number(data?.afterId || 0);
      this.isJoined = true;

      while (this.pendingQueue.length > 0) {
        const queued = this.pendingQueue.shift()!;
        void this.sendHttpImmediate(queued.event, queued.payload, queued.includeSelf);
      }

      this.statusCallback?.('SUBSCRIBED', { members: Array.isArray(data?.members) ? data.members : [] });

      if (this.httpPollTimer) clearInterval(this.httpPollTimer);
      this.httpPollTimer = setInterval(() => {
        void this.pollHttpRelay();
      }, 450);
    } catch (err) {
      console.error('WsRoomChannel HTTP relay join failed:', err);
      this.usingHttpFallback = false;
      this.isJoined = false;
      this.statusCallback?.('ERROR');
    }
  }

  private async pollHttpRelay() {
    if (this.isClosed || !this.usingHttpFallback || this.httpPollInFlight) return;
    const base = this.getHttpRelayBase();
    if (!base) return;
    this.httpPollInFlight = true;
    try {
      const url = `${base}/api/relay/poll?channel=${encodeURIComponent(this.channelName)}&memberId=${encodeURIComponent(this.memberId)}&username=${encodeURIComponent(this.username)}&afterId=${encodeURIComponent(String(this.httpAfterId))}`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (this.isClosed || !data) return;

      if (typeof data.latestId === 'number' && data.latestId > this.httpAfterId) {
        this.httpAfterId = data.latestId;
      }

      const events = Array.isArray(data.events) ? data.events : [];
      for (const ev of events) {
        if (!ev || !ev.event) continue;
        if (typeof ev.id === 'number' && ev.id > this.httpAfterId) {
          this.httpAfterId = ev.id;
        }
        if (ev.event === 'relay_member_joined') {
          this.emitLocal('relay_member_joined', {
            memberId: ev.payload?.memberId || ev.fromMemberId,
            username: ev.payload?.username || ev.username,
          });
        } else if (ev.event === 'relay_member_left') {
          this.emitLocal('relay_member_left', {
            memberId: ev.payload?.memberId || ev.fromMemberId,
            username: ev.payload?.username || ev.username,
          });
        } else {
          this.emitLocal(ev.event, ev.payload, { fromMemberId: ev.fromMemberId });
        }
      }
    } catch {
      // Transient polling errors ignored
    } finally {
      this.httpPollInFlight = false;
    }
  }

  private async sendHttpImmediate(event: string, payload: any, includeSelf = false) {
    const base = this.getHttpRelayBase();
    if (!base) return;
    try {
      await fetch(`${base}/api/relay/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: this.channelName,
          memberId: this.memberId,
          username: this.username,
          event,
          payload,
          includeSelf,
        }),
      });
    } catch (err) {
      console.error('WsRoomChannel HTTP relay send failed:', err);
    }
  }

  subscribe(callback?: (status: WsRelayStatus, meta?: { members?: WsRelayMember[] }) => void): this {
    if (callback) {
      this.statusCallback = callback;
    }
    this.isClosed = false;
    this.usingHttpFallback = false;

    const wsUrl = getGameWsUrl();
    if (!wsUrl) {
      void this.startHttpFallback();
      return this;
    }

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.isClosed) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            type: 'relay_join',
            channel: this.channelName,
            memberId: this.memberId,
            username: this.username,
          })
        );

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (!data || data.type === 'pong') return;

          if (data.type === 'relay_joined' && data.channel === this.channelName) {
            this.isJoined = true;
            while (this.pendingQueue.length > 0) {
              const queued = this.pendingQueue.shift()!;
              this.sendImmediate(queued.event, queued.payload, queued.includeSelf);
            }
            this.statusCallback?.('SUBSCRIBED', { members: data.members || [] });
          } else if (data.type === 'relay_event' && data.channel === this.channelName) {
            this.emitLocal(data.event, data.payload, { fromMemberId: data.fromMemberId });
          } else if (data.type === 'relay_member_joined' && data.channel === this.channelName) {
            this.emitLocal('relay_member_joined', {
              memberId: data.memberId,
              username: data.username,
            });
          } else if (data.type === 'relay_member_left' && data.channel === this.channelName) {
            this.emitLocal('relay_member_left', {
              memberId: data.memberId,
              username: data.username,
            });
          }
        } catch (err) {
          console.error('WsRoomChannel message parse error:', err);
        }
      };

      ws.onerror = () => {
        if (!this.isClosed && !this.isJoined) {
          try { ws.close(); } catch {}
          void this.startHttpFallback();
        }
      };

      ws.onclose = () => {
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        const wasJoined = this.isJoined;
        this.isJoined = false;
        if (!this.isClosed && !this.usingHttpFallback) {
          if (!wasJoined) {
            void this.startHttpFallback();
          } else {
            this.statusCallback?.('CLOSED');
          }
        }
      };
    } catch (err) {
      console.error('WsRoomChannel init error, switching to HTTP relay:', err);
      void this.startHttpFallback();
    }

    return this;
  }

  private sendImmediate(event: string, payload: any, includeSelf = false) {
    if (this.usingHttpFallback) {
      void this.sendHttpImmediate(event, payload, includeSelf);
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'relay_broadcast',
        channel: this.channelName,
        event,
        payload,
        includeSelf,
      })
    );
  }

  send(msg: { type?: string; event: string; payload?: any; includeSelf?: boolean }) {
    const event = msg.event;
    const payload = msg.payload !== undefined ? msg.payload : {};
    const includeSelf = !!msg.includeSelf;
    if (this.isClosed) return;

    if (this.usingHttpFallback && this.isJoined) {
      void this.sendHttpImmediate(event, payload, includeSelf);
      return;
    }

    if (!this.isJoined || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingQueue.push({ event, payload, includeSelf });
      return;
    }
    this.sendImmediate(event, payload, includeSelf);
  }

  unsubscribe() {
    this.isClosed = true;
    const wasHttp = this.usingHttpFallback;
    this.usingHttpFallback = false;
    this.isJoined = false;
    this.pendingQueue = [];
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.httpPollTimer) {
      clearInterval(this.httpPollTimer);
      this.httpPollTimer = null;
    }
    if (wasHttp) {
      const base = this.getHttpRelayBase();
      if (base) {
        fetch(`${base}/api/relay/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            channel: this.channelName,
            memberId: this.memberId,
            username: this.username,
          }),
        }).catch(() => {});
      }
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'relay_leave', channel: this.channelName }));
        }
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.handlers.clear();
  }
}

export function createWsRoomChannel(channelName: string, options: WsRelayOptions): WsRoomChannel {
  return new WsRoomChannel(channelName, options);
}

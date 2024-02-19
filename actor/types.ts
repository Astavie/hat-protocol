export interface System {
  add<T extends Actor>(actor: T): LocalAddress<T>;
  returnAddr<T>(destination: Peer, addr: LocalAddress<T> | string): Promise<Address<T> | null>;

  remove(uuid: string): void;
  send<T, K extends ActorMessage<T>>(id: Address<T> | LocalAddress<T>, msg: K, payload: ActorPayload<T, K>): Promise<void>;
  onClose(peer: Peer | undefined, callback: () => void): void;
}

export class Actor {
  uuid: string;
  constructor() {
    this.uuid = crypto.randomUUID()
  }
}

export type OrNull<T> = T extends NonNullable<unknown> ? T : null

export type ActorMessage<T> = string & {[K in keyof T]-?: T[K] extends (ctx: System, payload: infer _) => Promise<void> ? K : never}[keyof T];
export type ActorPayload<T, K extends keyof T> = T[K] extends (ctx: System, payload: infer P) => Promise<void> ? OrNull<P> : never;

export type Peer = number | string | undefined; // ipc, websocket, local

export type LocalAddress<_> = {
  peer: undefined,
  uuid: string
}

export type WebSocketAddress<_> = {
  peer: string,
  uuid: string,
}

export type IPCAddress<_> = {
  peer: number,
  uuid: string,
}

export type Address<T> = LocalAddress<T> | WebSocketAddress<T> | IPCAddress<T>

export function addressEq<T>(a: Address<T>, b: Address<T>): boolean {
  return a.peer === b.peer && a.uuid === b.uuid;
}

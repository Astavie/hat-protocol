export interface System {
  add<T extends Actor>(actor: T): Address<T>;
  remove(id: string): void;
  send<T, K extends ActorMessage<T>>(id: Address<T>, msg: K, payload: ActorPayload<T>[K]): void;
}

export class Actor {
  uuid: string;
  constructor() {
    this.uuid = crypto.randomUUID()
  }
}

export type OrNull<T> = T extends NonNullable<unknown> ? T : null

export type ActorMessage<T> = string & {[K in keyof T]-?: T[K] extends (ctx: System, payload: infer _) => void ? K : never}[keyof T];
export type ActorPayload<T> = {[K in keyof T]-?: T[K] extends (ctx: System, payload: infer P) => void ? OrNull<P> : never};

export type Address<_> = {
  host: string,
  uuid: string,
}

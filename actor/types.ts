export class Actor {
  uuid: string = crypto.randomUUID()
  onAdd(_: System) {}
  onRemove() {}
}

export interface Connection {
  send(addr: string, msg: string, payload: unknown): Promise<void>
}

export class System {
  private actors: Record<string, Actor> = {}

  uuid: string = crypto.randomUUID()
  peers: Record<string, Connection> = {}

  add<T extends Actor>(actor: T): Address<T> {
    this.actors[actor.uuid] = actor
    actor.onAdd(this)
    return this.addressOf(actor)
  }

  addressOf<T extends Actor>(actor: T): Address<T> {
    return `${this.uuid}:${actor.uuid}` as Address<T>
  }

  remove(addr: Address<unknown>): void {
    const split = (addr as string).split(":")
    const uuid = split[1]

    const actor = this.actors[uuid as string]
    if (actor !== undefined) {
      actor.onRemove()
    }
    delete this.actors[uuid as string]
  }

  async send<T, K extends ActorMessage<T>>(addr: Address<T>, msg: K, payload: ActorPayload<T, K>): Promise<void> {
    const split = (addr as string).split(":")
    if (split.length === 1) {
      // deno-lint-ignore no-explicit-any
      const actor = this.actors[addr as string] as any
      if (actor === undefined) {
        console.error(`Actor with UUID ${addr as string} not found.`);
      } else {
        await actor[msg]?.(this, payload)
      }
      return
    }

    const peer = split[0]
    const uuid = split[1]

    if (peer === this.uuid) {
      // deno-lint-ignore no-explicit-any
      const actor = this.actors[uuid] as any
      if (actor === undefined) {
        console.error(`Actor with UUID ${uuid} not found.`);
      } else {
        await actor[msg]?.(this, payload)
      }
      return
    }

    const conn = this.peers[peer]
    if (conn === undefined) {
      console.error(`Peer with UUID ${peer} not found.`)
    } else {
      await conn.send(addr as string, msg, payload)
    }
  }
}

export type OrNull<T> = T extends NonNullable<unknown> ? T : null

export type ActorMessage<T> = keyof T & `h_${string}`;
export type ActorPayload<T, K extends ActorMessage<T>> = T[K] extends (ctx: System, payload: infer P) => unknown ? OrNull<P> : never;

export type Address<T> = string & { readonly _: T }

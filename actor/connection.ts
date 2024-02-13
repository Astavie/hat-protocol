import { Actor, ActorPayload, ActorMessage, Address, System } from "./types.ts";

type Message = {
  actor: Address<unknown>,
  msg: string,
  payload: unknown,
}

type Peer = {
  socket: WebSocket,
  closeCallbacks: (() => void)[],
}

export class Connection implements System {
  private localhost: string;
  private actors: Record<string, Actor> = {}
  private server: Deno.HttpServer;

  private peers: Record<string, Peer> = {};

  constructor(hostname: string, publicname: string, port: number) {
    this.localhost = `${publicname}:${port}`;
    this.server = Deno.serve({ hostname, port }, (req) => {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response(null, { status: 501 })
      }

      const { socket, response } = Deno.upgradeWebSocket(req)
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as Message
        if (data.actor.host !== this.localhost) return

        // deno-lint-ignore no-explicit-any
        const actor = this.actors[data.actor.uuid] as any
        actor?.[data.msg]?.(this, data.payload)
      }

      return response
    })
  }

  async shutdown() {
    await this.server.shutdown()
  }

  add<T extends Actor>(actor: T): Address<T> {
    this.actors[actor.uuid] = actor
    return {
      host: this.localhost,
      uuid: actor.uuid,
    }
  }
  remove(uuid: string) {
    delete this.actors[uuid]
  }
  onClose(host: string, callback: () => void) {
    if (host === this.localhost) return
    this.connect(host).then(peer => peer.closeCallbacks.push(callback))
  }

  private async connect(host: string): Promise<Peer> {
    if (!(host in this.peers)) {
      // connect to peer
      const socket = new WebSocket(`ws://${host}`)
      await new Promise((resolve, reject) => {
        socket.onopen = () => {
          this.peers[host] = { socket, closeCallbacks: [] }
          resolve(undefined)
        }
        socket.onclose = () => {
          for (const callback of this.peers[host]?.closeCallbacks ?? []) {
            callback()
          }
          delete this.peers[host]
          reject(`could not connect to ${host}`)
        }
      })
    }
    return this.peers[host]
  }

  // Send message to actor
  async send<T, K extends ActorMessage<T>>(addr: Address<T>, msg: K, payload: ActorPayload<T, K>) {
    if (addr.host === this.localhost) {
      // deno-lint-ignore no-explicit-any
      const actor = this.actors[addr.uuid] as any
      actor?.[msg]?.(this, payload)
      return
    }

    const peer = await this.connect(addr.host)
    peer.socket.send(JSON.stringify({
      "actor": addr,
      "msg": msg,
      "payload": payload,
    } satisfies Message));
  }
}

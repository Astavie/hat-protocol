import { Actor, ActorPayload, ActorMessage, Address, System } from "./types.ts";

type Message = {
  actor: Address<unknown>,
  msg: string,
  payload: unknown,
}

export class Connection implements System {
  private localhost: string;
  private actors: Record<string, Actor> = {}
  private server: Deno.HttpServer;
  private peers: Record<string, WebSocket> = {};

  constructor(hostname: string, publicname: string, port: number) {
    this.localhost = `${publicname}:${port}`;
    this.server = Deno.serve({ hostname, port }, (req) => {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response(null, { status: 501 })
      }

      const { socket, response } = Deno.upgradeWebSocket(req)
      socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data) as Message
        if (data.actor.host !== this.localhost) return

        // deno-lint-ignore no-explicit-any
        const actor = this.actors[data.actor.uuid] as any
        actor?.[data.msg]?.(this, data.payload)
      })

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
    
  }

  // Send message to actor
  async send<T, K extends ActorMessage<T>>(addr: Address<T>, msg: K, payload: ActorPayload<T, K>) {
    if (addr.host === this.localhost) {
      // deno-lint-ignore no-explicit-any
      const actor = this.actors[addr.uuid] as any
      actor?.[msg]?.(this, payload)
      return
    }

    if (!(addr.host in this.peers)) {
      // connect to peer
      const socket = new WebSocket(`ws://${addr.host}`)
      await new Promise((resolve, reject) => {
        socket.onopen = () => {
          console.log("opened websocket")
          this.peers[addr.host] = socket
          resolve(undefined)
        }
        socket.onclose = () => {
          console.log("closed websocket")
          delete this.peers[addr.host]
          reject()
        }
      })
    }

    this.peers[addr.host].send(JSON.stringify({
      "actor": addr,
      "msg": msg,
      "payload": payload,
    } satisfies Message));
  }
}

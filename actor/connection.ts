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
        actor?.[data.msg](this, data.payload)
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
  remove(id: string) {
    delete this.actors[id]
  }

  // Send message to actor
  async send<T, K extends ActorMessage<T>>(id: Address<T>, msg: K, payload: ActorPayload<T>[K]): Promise<void> {
    if (id.host == this.localhost) {
      // deno-lint-ignore no-explicit-any
      const actor = this.actors[id.uuid] as any
      actor?.[msg](this, payload)
      return
    }

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${id.host}`)
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          "actor": id,
          "msg": msg,
          "payload": payload,
        } satisfies Message));
        resolve(undefined)
      })
      socket.addEventListener("error", () => {
        console.log("could not connect")
        reject()
      })
    })
  }
}

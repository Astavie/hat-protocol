import { ActorPayload } from "./types.ts";
import { ActorMessage } from "./types.ts";
import { Actor, System, Connection, Address } from "./types.ts"

type Message = {
  actor: string,
  msg: string,
  payload: unknown,
}

class WebSocketConnection implements Connection {
  ip: string
  private sock: WebSocket

  constructor(ip: string, sock: WebSocket) {
    this.ip = ip
    this.sock = sock
  }

  static create(ip: string, disconnect?: () => void): WebSocketConnection {
    const socket = new WebSocket(`ws://${ip}`)
    socket.onclose = disconnect ?? null
    return new WebSocketConnection(ip, socket)
  }

  send(addr: string, msg: string, payload: unknown): Promise<void> {
    if (this.sock.readyState === this.sock.OPEN) {
      this.sock.send(JSON.stringify({
        actor: addr,
        msg,
        payload
      } satisfies Message))
      return Promise.resolve()
    } else {
      return new Promise(resolve => {
        this.sock.addEventListener("open", () => {
          this.sock.send(JSON.stringify({
            actor: addr,
            msg,
            payload
          } satisfies Message))
          resolve()
        })
      })
    }
  }
}

type RPortalP2P = PortalP2P
export class PortalP2P<T extends PortalP2P = RPortalP2P> extends Actor {
  private server?: Deno.HttpServer
  private publicIp: string
 
  constructor(name: string, publicIp: string) {
    super()
    this.uuid = name
    this.publicIp = publicIp
  }

  override onAdd(ctx: System) {
    const port = this.publicIp.split(":")[1]
    this.server = Deno.serve({ port: parseInt(port) }, req => {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response(null, { status: 501 })
      }

      const { socket, response } = Deno.upgradeWebSocket(req)

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as Message;

        // deno-lint-ignore no-explicit-any
        (ctx as any).send(data.actor, data.msg, data.payload)
      }

      return response
    })
  }

  override onRemove() {
    this.server?.shutdown()
  }

  onConnect(_ctx: System, _addr: Address<T>): Promise<void> {
    return Promise.resolve()
  }

  onDisconnect(_ctx: System, _addr: Address<T>): Promise<void> {
    return Promise.resolve()
  }

  async broadcast<K extends ActorMessage<T>>(ctx: System, msg: K, payload: ActorPayload<T, K>) {
    const tasks = []

    for (const peer of Object.keys(ctx.peers)) {
      const conn = ctx.peers[peer]
      if (conn instanceof WebSocketConnection) {
        const addr = `${peer}:${this.uuid}` as Address<T>
        tasks.push(ctx.send(addr, msg, payload))
      }
    }

    await Promise.all(tasks)
  }

  serializePeers(ctx: System): Record<string, string> {
    const peers: Record<string, string> = {}
    peers[ctx.uuid] = this.publicIp

    for (const peer of Object.keys(ctx.peers)) {
      const conn = ctx.peers[peer]
      if (conn instanceof WebSocketConnection) {
        peers[peer] = conn.ip
      }   
    }
    return peers
  }

  async h_connect(ctx: System, ip: string) {
    await WebSocketConnection.create(ip).send(this.uuid, "h_syncPeers", this.serializePeers(ctx))
  }

  async h_syncPeers(ctx: System, ips: Record<string, string>) {
    const newPeers = Object.keys(ips).filter(peer => !(peer in ctx.peers || peer === ctx.uuid))

    // update peers
    for (const peer of newPeers) {
      ctx.peers[peer] = WebSocketConnection.create(ips[peer], () => {
        delete ctx.peers[peer]
        const addr = `${peer}:${this.uuid}` as Address<T>
        this.onDisconnect(ctx, addr)
      })
    }

    // send response
    const peers = this.serializePeers(ctx)
    const tasks = newPeers.map(async peer => {
      await ctx.send(`${peer}:${this.uuid}` as Address<PortalP2P>, "h_syncPeers", peers)
      await this.onConnect(ctx, `${peer}:${this.uuid}` as Address<T>)
    })

    await Promise.all(tasks)
  }
}

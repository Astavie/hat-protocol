import { Actor, ActorPayload, ActorMessage, Address, System, LocalAddress, Peer } from "./types.ts";

type Message = {
  actor: Address<unknown>,
  msg: string,
  payload: unknown,
}

type PeerConnection = {
  me: Peer, // the address this remote peer knows us as
  socket: WebSocket,
  closeCallbacks: (() => void)[],
}

export class Connection implements System {
  private actors: Record<string, Actor> = {}

  private peers: Record<Peer, PeerConnection | Promise<PeerConnection | null>> = {};

  private port: number
  private server: Deno.HttpServer;

  constructor(port: number) {
    this.port = port
    this.server = Deno.serve({ port }, (req, info) => {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response(null, { status: 501 })
      }

      const { socket, response } = Deno.upgradeWebSocket(req)

      // send remote back its ip
      socket.onopen = () => {
        socket.send(JSON.stringify({ msg: "shake", payload: `${info.remoteAddr.hostname.replaceAll("127.0.0.1", "localhost")}` }))
      }

      // await messages
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as Message
        this.handleLocalMessage({ peer: undefined, uuid: data.actor.uuid }, data.msg, data.payload)
      }

      return response
    })
  }

  async shutdown() {
    await this.server.shutdown()
  }

  add<T extends Actor>(actor: T): LocalAddress<T> {
    this.actors[actor.uuid] = actor
    return {
      peer: undefined,
      uuid: actor.uuid,
    }
  }
  async returnAddr<T>(destination: Peer, addr: LocalAddress<T> | string): Promise<Address<T> | null> {
    const peer = await this.connect(destination);
    if (peer === null) {
      return null
    }

    const uuid = typeof addr === "string" ? addr : addr.uuid;
    return {
      peer: peer.me,
      uuid,
    }
  }

  remove(uuid: string) {
    delete this.actors[uuid]
  }
  onClose(peer: Peer, callback: () => void) {
    this.connect(peer).then(peer => {
      if (peer === null) {
        // could not connect, run callback immediately
        callback()        
      } else {
        // connected! run callback on close
        peer.closeCallbacks.push(callback)
      }
    })
  }

  private async connect(peer: Peer): Promise<PeerConnection | null> {
    if (typeof peer === "number") {
      // TODO: IPC connection
      return null
    }

    if (!(peer in this.peers)) {
      // connect to peer
      const socket = new WebSocket(`ws://${peer}`)
      this.peers[peer] = new Promise(resolve => {
        const callbacks: (() => void)[] = [];
        socket.onmessage = (ev) => {
          console.log(`Connection with ${peer} opened.`)
          const data = JSON.parse(ev.data);
          if (data.msg === "shake") {
            this.peers[peer] = {
              socket,
              closeCallbacks: callbacks,
              me: `${data.payload}:${this.port}`,
            }
            resolve(this.peers[peer])
          }
        }
        socket.onclose = () => {
          console.log(`Connection with ${peer} closed.`)
          callbacks.forEach(callback => callback());
          delete this.peers[peer]
          resolve(null)
        }
      })
    }

    return await this.peers[peer]
  }

  // Send message to actor
  async send<T, K extends ActorMessage<T>>(addr: Address<T> | LocalAddress<T>, msg: K, payload: ActorPayload<T, K>) {
    // handle local actor message
    if (addr.peer === undefined) {
      await this.handleLocalMessage({ peer: undefined, uuid: addr.uuid }, msg, payload)
      return
    }

    // send message to remote actor
    const peer = await this.connect(addr.peer)
    if (peer !== null) {
      peer.socket.send(JSON.stringify({
        "actor": addr,
        "msg": msg,
        "payload": payload,
      } satisfies Message));
    }
  }

  private async handleLocalMessage(addr: LocalAddress<unknown>, msg: string, payload: unknown) {
    // deno-lint-ignore no-explicit-any
    const actor = this.actors[addr.uuid] as any
    if (actor === undefined) {
      console.error(`Actor with UUID ${addr.uuid} not found.`);
    }
    await actor[msg]?.(this, payload)
  }
}

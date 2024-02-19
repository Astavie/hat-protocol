import { Connection } from "./actor/connection.ts";
import { Actor, Address, System } from "./actor/types.ts";
import { addressEq } from "./actor/types.ts";

class MessageLog extends Actor {
  peers: Address<MessageLog>[] = [];
  messages: string[] = [];
  onMessage?: (msg: string) => void;

  // deno-lint-ignore require-await
  async send(_: System, msg: string) {
    this.messages.push(msg)
    this.onMessage?.(msg)
  }
  // deno-lint-ignore require-await
  async sync(_: System, messages: string[]) {
    this.messages = messages
    for (const msg of messages) {
      this.onMessage?.(msg)
    }
  }
  async connect(ctx: System, peers: Address<MessageLog>[]) {
    // peers that will establish a new connection
    const newPeers = peers.filter(peer => !this.peers.some(p => addressEq(p, peer)));

    // peers already connected that the provided list don't include
    const hasExtraPeers = this.peers.some(peer => !peers.some(p => addressEq(p, peer)));

    // send reponse
    this.peers.push(...newPeers);
    const tasks = newPeers.map(async peer => {
      // remove from peer list on close
      ctx.onClose(peer.peer, () => this.peers = this.peers.filter(p => !addressEq(p, peer)))

      // get return address
      const me = await ctx.returnAddr(peer.peer, this.uuid);
      if (me === null) return // couldn't connect to new peer

      // send updated peer list back (excluding that peer, including myself)
      await ctx.send(peer, "connect", [...this.peers.filter(p => !addressEq(p, peer)), me]);

      // send our message list if we know of more peers (this must be the first connection)
      if (hasExtraPeers) {
        await ctx.send(peer, "sync", this.messages);
      }
    });

    await Promise.all(tasks)
  }
  async broadcast(ctx: System, msg: string) {
    this.messages.push(msg);
    this.onMessage?.(msg);

    const tasks = this.peers.map(peer => ctx.send(peer, "send", msg));
    await Promise.all(tasks)
  }
}

const stream = Deno.stdin.readable.values()

async function asyncPrompt(): Promise<string> {
  const next = await stream.next()
  if ('done' in next && next.done) {
    return ""
  } else {
    return new TextDecoder().decode(next.value).slice(0, -1)
  }
}

if (import.meta.main) {
  let port = 53706;
  if (Deno.args[0]) {
    port = parseInt(Deno.args[0])
  }

  const conn = new Connection(port)

  const log = new MessageLog()
  log.uuid = "log";
  log.peers = []
  log.onMessage = msg => {
    console.log(msg)
  }

  const log_addr = conn.add(log)

  while (true) {
    const msg = await asyncPrompt() ?? ""

    if (msg.startsWith("/")) {
      const cmd = msg.substring(1).split(" ");
      switch (cmd[0]) {
        case "c":
        case "conn":
        case "connect": {
          if (!cmd[1]) {
            console.log(`Use: '/${cmd} <ip:port>'`)
            continue;
          }
          console.log(`Connecting to ${cmd[1]}...`)
          const remote: Address<MessageLog> = {
            peer: cmd[1].replaceAll("127.0.0.1", "localhost"),
            uuid: "log",
          }
          const peers = [...log.peers, remote]
          conn.send(log_addr, "connect", peers)
          break;
        }
        default: {
          console.log(`Unknown command '/${cmd}'.`)
          break;
        }
      }
    } else {
      conn.send(log_addr, "broadcast", ` ${port} | ${msg}`)
    }
  }
}

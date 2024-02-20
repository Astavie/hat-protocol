import { Address, System } from "./actor/types.ts";
import { PortalP2P } from "./actor/p2p.ts"
import { getIP } from "https://deno.land/x/get_ip@v2.0.0/mod.ts";

type ReceivePayload = {
  addr: Address<ChatApp>,
  name: string,
} & ({ msg: string } | { event: "JOIN" | "LEAVE" })

class ChatApp extends PortalP2P<ChatApp> {
  name: string

  messages: string[] = []
  names: Record<string, string> = {}

  constructor(publicIp: string, name: string) {
    super("chat", publicIp)
    this.name = name
  }

  override async onConnect(ctx: System, addr: Address<ChatApp>): Promise<void> {
    await ctx.send(addr, "h_receive", {
      addr: ctx.addressOf(this),
      name: this.name,
      event: "JOIN",
    })
  }

  override onDisconnect(ctx: System, addr: Address<ChatApp>): Promise<void> {
    if (addr as string in this.names) {
      this.h_receive(ctx, {
        addr,
        name: this.names[addr as string],
        event: "LEAVE",
      })
    }
    return Promise.resolve()
  }

  h_receive(_: System, msg: ReceivePayload) {
    this.names[msg.addr as string] = msg.name
    if ("event" in msg) {
      switch (msg.event) {
        case "JOIN": {
          console.log(`${msg.name} joined the chat`)
          break
        }
        case "LEAVE": {
          delete this.names[msg.addr as string]
          console.log(`${msg.name} left the chat`)
          break
        }
      }
    } else {
      this.messages.push(`<${msg.name}> ${msg.msg}`)
      console.log(`<${msg.name}> ${msg.msg}`)
    }
  }

  async h_broadcast(ctx: System, msg: string) {
    this.messages.push(`<${this.name}> ${msg}`)
    console.log(`<${this.name}> ${msg}`)

    await this.broadcast(ctx, "h_receive", {
      addr: ctx.addressOf(this),
      name: this.name,
      msg,
    })
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
  const name = Deno.args[0] ?? "anonymous"
  const ip = Deno.args[1] ?? `${await getIP()}:53706`

  const ctx = new System()
  const portal = ctx.add(new ChatApp(ip, name))

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
          ctx.send(portal, "h_connect", cmd[1])
          break;
        }
        default: {
          console.log(`Unknown command '/${cmd}'.`)
          break;
        }
      }
    } else {
      // clear line
      await Deno.stdout.write(new TextEncoder().encode("\x1b[1A\r\x1b[K"))
      ctx.send(portal, "h_broadcast", msg)
    }
  }
}

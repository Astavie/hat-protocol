import { Connection } from "./actor/connection.ts";
import { getIP } from "https://deno.land/x/get_ip@v2.0.0/mod.ts";
import { Actor, Address, System } from "./actor/types.ts";

class MessageLog extends Actor {
  messages: string[] = [];
  onMessage?: () => void;
  // deno-lint-ignore require-await
  async send(_: System, msg: string) {
    this.messages.push(msg)
    this.onMessage?.()
  }
  // deno-lint-ignore require-await
  async sync(_: System, msg: string[]) {
    console.log("Remote connected")
    this.messages = msg
    this.onMessage?.()
  }
  async requestSync(ctx: System, remote: Address<MessageLog>) {
    ctx.onClose(remote.host, () => console.log("Remote disconnected"))
    await ctx.send(remote, "sync", this.messages)
  }
}

const stream = Deno.stdin.readable.values()

async function asyncPrompt(question: string): Promise<string> {
  const text = new TextEncoder().encode(`${question} `)
  await Deno.stdout.write(text)

  const next = await stream.next()
  if ('done' in next && next.done) {
    return ""
  } else {
    return new TextDecoder().decode(next.value).slice(0, -1)
  }
}

if (import.meta.main) {
  if (!Deno.args[0] || !Deno.args[1]) {
    console.log(`USE: hat <local ip> <remote ip>`)
    Deno.exit()
  }

  const log = new MessageLog()
  log.uuid = "log";

  log.onMessage = () => {
    console.log()
    console.log("-- LOG --")
    for (const message of log.messages) {
      console.log(message)
    }
  }


  const publicname = await getIP()
  const conn = new Connection(Deno.args[0], publicname, 53706);

  const addr = conn.add(log)
  console.log("Server host: " + addr.host);

  const remote: Address<MessageLog> = {
    host: Deno.args[1],
    uuid: "log",
  }

  await conn.send(remote, "requestSync", addr)
  console.log("Connected!")

  while (true) {
    const msg = await asyncPrompt("?") ?? ""
    conn.send(remote, "send", msg)

    log.messages.push(msg)
    log.onMessage?.()
  }
}

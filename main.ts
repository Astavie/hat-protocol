import { Connection } from "./actor/connection.ts";
import { getIP } from "https://deno.land/x/get_ip@v2.0.0/mod.ts";
import { Actor, Address, System } from "./actor/types.ts";
import { getNetworkAddr } from "https://deno.land/x/local_ip@0.0.3/mod.ts";

class MessageLog extends Actor {
  messages: string[] = [];
  onMessage?: () => void;
  // deno-lint-ignore require-await
  async send(_: System, msg: string) {
    this.messages.push(msg)
    this.onMessage?.()
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
  const hostname = await getNetworkAddr() ?? "";
  const publicname = await getIP()
  const conn = new Connection(hostname, publicname, 53706);

  const log = new MessageLog()
  log.uuid = "log";

  const addr = conn.add(log)
  console.log("Server host: " + addr.host);

  const host = prompt("Remote host:") ?? "";
  const remote: Address<MessageLog> = {
    host,
    uuid: "log",
  }

  await conn.connect(remote.host)
  console.log("Connected!")

  conn.onClose(remote.host, () => console.log("Remote disconnected"))

  log.onMessage = () => {
    console.log()
    console.log("-- LOG --")
    for (const message of log.messages) {
      console.log(message)
    }
  }

  while (true) {
    const msg = await asyncPrompt("?") ?? ""
    conn.send(remote, "send", msg)

    log.messages.push(msg)
    log.onMessage?.()
  }
}

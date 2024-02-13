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

if (import.meta.main) {
  const hostname = await getNetworkAddr() ?? "";
  const publicname = await getIP()
  const conn = new Connection(hostname, publicname, 53706);

  const log = new MessageLog()
  const addr = conn.add(log)
  console.log("Server host: " + addr.host);
  console.log("Log uuid: " + addr.uuid);

  const host = prompt("Remote host:") ?? "";
  const uuid = prompt("Remote log uuid:") ?? "";
  const remote: Address<MessageLog> = {
    host,
    uuid,
  }

  conn.onClose(remote.host, () => console.log("Remote disconnected"))
  console.log("Connected!")

  log.onMessage = () => {
    for (const message of log.messages) {
      console.log(message)
    }
  }

  while (true) {
    const msg = prompt("?") ?? ""
    conn.send(remote, "send", msg)
  }
}

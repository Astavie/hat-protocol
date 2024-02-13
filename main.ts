import { Connection } from "./actor/connection.ts";
import { getIP } from "https://deno.land/x/get_ip@v2.0.0/mod.ts";
import { Node } from "./node/node.ts";
import { Address } from "./actor/types.ts";
import { getNetworkAddr } from "https://deno.land/x/local_ip@0.0.3/mod.ts";

if (import.meta.main) {
  const hostname = await getNetworkAddr() ?? "";
  const publicname = await getIP()
  const conn = new Connection(hostname, publicname, 53706);

  const server = confirm("Server?")

  if (server) {
    const position = conn.add(new Node())
    console.log("Server host: " + position.host);
    console.log("Node uuid: " + position.uuid);
  } else {
    const host = prompt("Server host: ") ?? ""
    const uuid = prompt("Node uuid: ") ?? ""
    const position: Address<Node> = {
      host,
      uuid,
    }
    await conn.send(position, "setPose", { "transform": [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, -2]] })
    await conn.send(position, "delete", {})
  }
}

// Minimale DO-basis voor tests zonder Cloudflare of netwerk.
export class DurableObject {
  constructor(public ctx: any, public env: any) {}
}
